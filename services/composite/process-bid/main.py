"""
Process Bid Composite Service
POST /bid

Flow:
1. Validate bidder exists and has role=buyer (User Service)
2. Fetch auction status & current bid (Auction Service)
3. Validate bid amount > current_highest_bid and auction is active
4. Update auction with new highest bid (Auction Service)
5. Publish bid.outbid (previous bidder) and bid.confirmed (new bidder)
"""

import os
import json
import pika
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests as http

app = Flask(__name__)
CORS(app)

USER_SERVICE = os.environ.get("USER_SERVICE_URL", "http://user:5001")
AUCTION_SERVICE = os.environ.get("AUCTION_SERVICE_URL", "http://auction:5003")
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


@app.route("/bid", methods=["POST"])
def process_bid():
    data = request.json
    if not data or not all(k in data for k in ("auction_id", "bidder_id", "bid_amount")):
        return jsonify({"error": "Missing required fields"}), 400

    auction_id = data["auction_id"]
    bidder_id = data["bidder_id"]
    bid_amount = float(data["bid_amount"])

    # 1. Validate bidder
    user_resp = http.get(f"{USER_SERVICE}/user/{bidder_id}", timeout=5)
    if user_resp.status_code != 200:
        return jsonify({"error": "User not found"}), 400
    bidder = user_resp.json()
    if bidder.get("role") != "buyer":
        return jsonify({"error": "User is not a buyer"}), 403

    # 2. Fetch auction
    auc_resp = http.get(f"{AUCTION_SERVICE}/auction/{auction_id}", timeout=5)
    if auc_resp.status_code != 200:
        return jsonify({"error": "Auction not found"}), 404
    auction = auc_resp.json()

    # 3. Validate bid
    if auction["status"] != "active":
        return jsonify({"error": "Auction is not active"}), 400

    min_bid = max(auction["start_price"], auction["current_highest_bid"])
    if bid_amount <= min_bid:
        return jsonify(
            {"error": f"Bid must be greater than current highest bid of {min_bid}"}
        ), 400

    previous_bidder_id = auction.get("highest_bidder_id")

    # 4. Update auction
    update_resp = http.put(
        f"{AUCTION_SERVICE}/auction/{auction_id}",
        json={"current_highest_bid": bid_amount, "highest_bidder_id": bidder_id},
        timeout=5,
    )
    if update_resp.status_code != 200:
        return jsonify({"error": "Failed to update auction"}), 500

    # 5a. Notify outbid previous bidder
    if previous_bidder_id and previous_bidder_id != bidder_id:
        prev_resp = http.get(f"{USER_SERVICE}/user/{previous_bidder_id}", timeout=5)
        if prev_resp.status_code == 200:
            prev_user = prev_resp.json()
            publish_event(
                "bid.outbid",
                {
                    "auction_id": auction_id,
                    "outbid_user_id": previous_bidder_id,
                    "outbid_telegram": prev_user.get("telegram_handle"),
                    "new_highest_bid": bid_amount,
                },
            )

    # 5b. Confirm new bid
    publish_event(
        "bid.confirmed",
        {
            "auction_id": auction_id,
            "bidder_id": bidder_id,
            "bidder_telegram": bidder.get("telegram_handle"),
            "bid_amount": bid_amount,
        },
    )

    return jsonify(
        {
            "message": "Bid placed successfully",
            "auction_id": auction_id,
            "bid_amount": bid_amount,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5011, debug=True)
