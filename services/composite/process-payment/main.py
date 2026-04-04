"""
Process Payment Composite Service
POST /process-payment  — create Stripe session and return checkout URL
POST /webhook          — Stripe webhook: handle payment.success / payment.failed

Flow (process-payment):
1. Create Stripe checkout session
2. Return checkout URL to caller (Notification sends it via Telegram)

Flow (webhook):
- payment.success: update Order status → CONFIRMED, log Payment, publish order.confirmed
- payment.failed / checkout.expired: trigger rollback via Process Winner
"""

import os
import json
import pika
import stripe
from flask import Flask, request, jsonify
import requests as http
from adapters.stripe_wrapper import create_checkout_session, retrieve_session

app = Flask(__name__)

ORDER_SERVICE = os.environ.get("ORDER_SERVICE_URL", "http://order:5004")
PAYMENT_SERVICE = os.environ.get("PAYMENT_SERVICE_URL", "http://payment:5005")
PROCESS_WINNER = os.environ.get("PROCESS_WINNER_URL", "http://process-winner:5012")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
USER_SERVICE = os.environ.get("USER_SERVICE_URL", "https://personal-vsev7crp.outsystemscloud.com/User/rest/User")


def publish_event(event_type: str, payload: dict):
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.exchange_declare(exchange="digicam", exchange_type="topic", durable=True)
        ch.basic_publish(
            exchange="digicam",
            routing_key=event_type,
            body=json.dumps(payload),
            properties=pika.BasicProperties(content_type="application/json", delivery_mode=2),
        )
        conn.close()
    except Exception as exc:
        app.logger.warning(f"Failed to publish {event_type}: {exc}")


@app.route("/process-payment", methods=["POST"])
def process_payment():
    data = request.json
    if not data or not all(k in data for k in ("order_id", "amount", "description")):
        return jsonify({"error": "Missing required fields"}), 400

    session = create_checkout_session(
        order_id=data["order_id"],
        amount_sgd=float(data["amount"]),
        description=data.get("description", "Digicam Purchase"),
    )
    return jsonify(
        {
            "order_id": data["order_id"],
            "checkout_url": session["checkout_url"],
            "session_id": session["session_id"],
        }
    )


@app.route("/webhook", methods=["POST"])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        return jsonify({"error": "Invalid signature"}), 400

    event_type = event["type"]
    session_obj = event["data"]["object"]

    order_id = int(session_obj.get("metadata", {}).get("order_id", 0))
    if not order_id:
        return jsonify({"error": "No order_id in metadata"}), 400

    if event_type == "checkout.session.completed":
        if session_obj.get("payment_status") == "paid":
            # Confirm order
            http.put(f"{ORDER_SERVICE}/order/{order_id}", json={"status": "confirmed"}, timeout=5)

            # Log payment
            http.post(
                f"{PAYMENT_SERVICE}/payment",
                json={
                    "order_id": order_id,
                    "stripe_payment_id": session_obj.get("payment_intent"),
                    "amount": session_obj.get("amount_total", 0) / 100,
                    "status": "paid",
                },
                timeout=5,
            )

            # Get buyer's telegram so notification service can send confirmation
            buyer_telegram = None
            try:
                order_resp = http.get(f"{ORDER_SERVICE}/order/{order_id}", timeout=5)
                if order_resp.status_code == 200:
                    buyer_id = order_resp.json().get("buyer_id")
                    user_resp = http.get(f"{USER_SERVICE}/user/{buyer_id}", timeout=5)
                    if user_resp.status_code == 200:
                        user_data = user_resp.json()
                        user = user_data.get("data", user_data)
                        buyer_telegram = user.get("telegram_chat_id")
            except Exception as exc:
                app.logger.warning(f"Could not fetch buyer telegram: {exc}")

            publish_event(
                "order.confirmed",
                {
                    "order_id": order_id,
                    "buyer_telegram": buyer_telegram,
                },
            )

    elif event_type in ("checkout.session.expired", "payment_intent.payment_failed"):
        # Fetch order to get auction_id
        order_resp = http.get(f"{ORDER_SERVICE}/order/{order_id}", timeout=5)
        if order_resp.status_code == 200:
            order = order_resp.json()
            http.post(
                f"{PROCESS_WINNER}/rollback",
                json={
                    "order_id": order_id,
                    "auction_id": order["auction_id"],
                    "reason": "payment_failed",
                },
                timeout=5,
            )

    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5013, debug=True)
