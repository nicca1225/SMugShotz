"""
Process Winner Composite Service
POST /process-winner  — triggered when auction end_time is reached
POST /rollback        — triggered on payment failure

Flow (process-winner):
1. Get auction winner (Auction Service)
2. Get winner & seller contact info (User Service)
3. Create pending Order (Order Service)
4. Publish winner.notify event → Notification sends Telegram payment link

Flow (rollback):
1. Delete order (Order Service)
2. Mark auction as failed (Auction Service)
3. Publish auction.failed event → Notification alerts seller + bidders
"""

import os
import json
import pika
from flask import Flask, request, jsonify
import requests as http

app = Flask(__name__)

USER_SERVICE = os.environ.get("USER_SERVICE_URL", "http://user:5001")
AUCTION_SERVICE = os.environ.get("AUCTION_SERVICE_URL", "http://auction:5003")
ORDER_SERVICE = os.environ.get("ORDER_SERVICE_URL", "http://order:5004")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")


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
    except Exception as e:
        app.logger.warning(f"Failed to publish {event_type}: {e}")


@app.route("/process-winner", methods=["POST"])
def process_winner():
    data = request.json
    auction_id = data.get("auction_id")
    if not auction_id:
        return jsonify({"error": "auction_id required"}), 400

    # 1. Get auction details
    auc_resp = http.get(f"{AUCTION_SERVICE}/auction/{auction_id}", timeout=5)
    if auc_resp.status_code != 200:
        return jsonify({"error": "Auction not found"}), 404
    auc_json = auc_resp.json()
    auction = auc_json.get("data", auc_json)

    winner_id = auction.get("highest_bidder_id")
    if not winner_id:
        # No bids — mark failed
        http.put(f"{AUCTION_SERVICE}/auction/{auction_id}", json={"status": "failed"}, timeout=5)
        publish_event("auction.failed", {"auction_id": auction_id, "reason": "no_bids"})
        return jsonify({"message": "Auction ended with no bids"}), 200

    # 2. Get winner and seller info
    winner_resp = http.get(f"{USER_SERVICE}/user/{winner_id}", timeout=5)
    seller_resp = http.get(f"{USER_SERVICE}/user/{auction['seller_id']}", timeout=5)
    winner_json = winner_resp.json() if winner_resp.status_code == 200 else {}
    seller_json = seller_resp.json() if seller_resp.status_code == 200 else {}
    winner = winner_json.get("data", winner_json)
    seller = seller_json.get("data", seller_json)

    # 3. Create pending order
    order_payload = {
        "auction_id": auction_id,
        "buyer_id": winner_id,
        "seller_id": auction["seller_id"],
        "amount": auction["current_highest_bid"],
        "status": "pending",
    }
    order_resp = http.post(f"{ORDER_SERVICE}/order", json=order_payload, timeout=5)
    if order_resp.status_code != 201:
        return jsonify({"error": "Failed to create order"}), 500
    order = order_resp.json()

    # 4. Publish winner.notify
    publish_event(
        "winner.notify",
        {
            "auction_id": auction_id,
            "order_id": order["order_id"],
            "winner_id": winner_id,
            "winner_telegram": winner.get("telegram_chat_id"),
            "seller_telegram": seller.get("telegram_chat_id"),
            "amount": auction["current_highest_bid"],
        },
    )

    return jsonify(
        {
            "message": "Winner processed",
            "order_id": order["order_id"],
            "winner_id": winner_id,
            "amount": auction["current_highest_bid"],
        }
    )


@app.route("/rollback", methods=["POST"])
def rollback():
    data = request.json
    order_id = data.get("order_id")
    auction_id = data.get("auction_id")
    if not order_id or not auction_id:
        return jsonify({"error": "order_id and auction_id required"}), 400

    # Delete order
    http.delete(f"{ORDER_SERVICE}/order/{order_id}", timeout=5)

    # Mark auction failed
    http.put(f"{AUCTION_SERVICE}/auction/{auction_id}", json={"status": "failed"}, timeout=5)

    # Notify
    publish_event(
        "auction.failed",
        {
            "auction_id": auction_id,
            "order_id": order_id,
            "reason": data.get("reason", "payment_failed"),
        },
    )

    return jsonify({"message": "Rollback complete"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5012, debug=True)
