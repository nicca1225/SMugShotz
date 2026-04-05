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
import threading
import pika
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests as http
from grpc_client import create_order_grpc

app = Flask(__name__)
CORS(app)

USER_SERVICE = os.environ.get("USER_SERVICE_URL", "http://user:5001")
AUCTION_SERVICE = os.environ.get("AUCTION_SERVICE_URL", "http://auction:5003")
ORDER_SERVICE = os.environ.get("ORDER_SERVICE_URL", "http://order:5004")
ORDER_GRPC_URL = os.environ.get("ORDER_GRPC_URL", "order:50051")
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


def update_auction_status(auction: dict, status: str):
    auction_id = auction.get("auction_id") or auction.get("id")
    if not auction_id:
        return False, "Missing auction_id in auction payload."

    update_payload = {
        "auction_id": auction_id,
        "status": status,
        "current_highest_bid": auction.get("current_highest_bid", 0),
        "highest_bidder_id": auction.get("highest_bidder_id"),
    }

    try:
        response = http.put(f"{AUCTION_SERVICE}/Auction", json=update_payload, timeout=5)
    except http.RequestException as exc:
        return False, f"Failed to update auction status: {exc}"

    if response.status_code not in (200, 201, 204):
        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text[:300]}
        return False, f"Auction status update failed with HTTP {response.status_code}: {payload}"

    return True, None


def create_order(auction_id, winner_id, seller_id, amount):
    order, grpc_error = create_order_grpc(
        ORDER_GRPC_URL,
        auction_id=auction_id,
        buyer_id=winner_id,
        seller_id=seller_id,
        amount=amount,
    )
    if not grpc_error:
        return order, None

    app.logger.warning(
        "gRPC order creation failed for auction #%s, falling back to REST: %s",
        auction_id,
        grpc_error,
    )

    try:
        response = http.post(
            f"{ORDER_SERVICE}/order",
            json={
                "auction_id": auction_id,
                "buyer_id": winner_id,
                "seller_id": seller_id,
                "amount": amount,
                "status": "pending",
            },
            timeout=8,
        )
    except http.RequestException as exc:
        return None, f"{grpc_error}; REST fallback request failed: {exc}"

    if response.status_code != 201:
        return None, f"{grpc_error}; REST fallback returned HTTP {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        return None, f"{grpc_error}; REST fallback returned invalid JSON"

    return {
        "order_id": data.get("order_id"),
        "amount": data.get("amount", amount),
    }, None


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
        updated, update_error = update_auction_status(auction, "FAILED")
        if not updated:
            app.logger.error("Failed to mark auction #%s as FAILED: %s", auction_id, update_error)
        publish_event("auction.failed", {"auction_id": auction_id, "reason": "no_bids"})
        return jsonify({"message": "Auction ended with no bids"}), 200

    # 2. Get winner and seller info
    winner_resp = http.get(f"{USER_SERVICE}/user/{winner_id}", timeout=5)
    seller_resp = http.get(f"{USER_SERVICE}/user/{auction['seller_id']}", timeout=5)
    winner_json = winner_resp.json() if winner_resp.status_code == 200 else {}
    seller_json = seller_resp.json() if seller_resp.status_code == 200 else {}
    winner = winner_json.get("data", winner_json)
    seller = seller_json.get("data", seller_json)

    # 3. Create pending order via gRPC
    order, order_error = create_order(
        auction_id=auction_id,
        winner_id=winner_id,
        seller_id=auction["seller_id"],
        amount=auction["current_highest_bid"],
    )
    if order_error:
        app.logger.error(f"Order creation failed: {order_error}")
        return jsonify({"error": "Failed to create order"}), 500

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
    auction_resp = http.get(f"{AUCTION_SERVICE}/auction/{auction_id}", timeout=5)
    if auction_resp.status_code == 200:
        auction_json = auction_resp.json()
        auction = auction_json.get("data", auction_json)
        updated, update_error = update_auction_status(auction, "FAILED")
        if not updated:
            app.logger.error("Failed to mark auction #%s as FAILED during rollback: %s", auction_id, update_error)
    else:
        app.logger.error("Failed to fetch auction #%s for rollback status update: HTTP %s", auction_id, auction_resp.status_code)

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


def handle_auction_expired(auction_id: int):
    """Same logic as POST /process-winner but called from AMQP consumer."""
    with app.app_context():
        app.logger.info(f"[consumer] auction.expired fired for auction #{auction_id}")

        auc_resp = http.get(f"{AUCTION_SERVICE}/auction/{auction_id}", timeout=5)
        if auc_resp.status_code != 200:
            app.logger.error(f"[consumer] Auction #{auction_id} not found")
            return
        auc_json = auc_resp.json()
        auction = auc_json.get("data", auc_json)

        winner_id = auction.get("highest_bidder_id")
        if not winner_id:
            updated, update_error = update_auction_status(auction, "FAILED")
            if not updated:
                app.logger.error("[consumer] Failed to mark auction #%s as FAILED: %s", auction_id, update_error)
            publish_event("auction.failed", {"auction_id": auction_id, "reason": "no_bids"})
            app.logger.info(f"[consumer] Auction #{auction_id} ended with no bids")
            return

        winner_resp = http.get(f"{USER_SERVICE}/user/{winner_id}", timeout=5)
        seller_resp = http.get(f"{USER_SERVICE}/user/{auction['seller_id']}", timeout=5)
        winner = (winner_resp.json() if winner_resp.status_code == 200 else {}).get("data", {})
        seller = (seller_resp.json() if seller_resp.status_code == 200 else {}).get("data", {})

        # Create order via gRPC
        order, order_error = create_order(
            auction_id=auction_id,
            winner_id=winner_id,
            seller_id=auction["seller_id"],
            amount=auction["current_highest_bid"],
        )
        if order_error:
            app.logger.error(f"[consumer] Order creation failed for auction #{auction_id}: {order_error}")
            return

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
        app.logger.info(f"[consumer] Winner processed for auction #{auction_id}, order #{order['order_id']}")


def start_consumer():
    """Background thread: listens for auction.expired on the delayed exchange."""
    import time
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 60
            conn = pika.BlockingConnection(params)
            ch = conn.channel()

            ch.exchange_declare(
                exchange="digicam-delayed",
                exchange_type="x-delayed-message",
                durable=True,
                arguments={"x-delayed-type": "topic"},
            )
            result = ch.queue_declare(queue="auction-expiry", durable=True)
            ch.queue_bind(exchange="digicam-delayed", queue="auction-expiry", routing_key="auction.expired")
            ch.basic_qos(prefetch_count=1)

            def on_message(ch, method, properties, body):
                try:
                    payload = json.loads(body)
                    auction_id = payload.get("auction_id")
                    if auction_id:
                        handle_auction_expired(int(auction_id))
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                except Exception as e:
                    app.logger.error(f"[consumer] Error: {e}")
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

            ch.basic_consume(queue="auction-expiry", on_message_callback=on_message)
            app.logger.info("[consumer] Waiting for auction.expired events...")
            ch.start_consuming()
        except Exception as e:
            app.logger.warning(f"[consumer] Connection lost: {e}. Retrying in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    t = threading.Thread(target=start_consumer, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5012, debug=False)
