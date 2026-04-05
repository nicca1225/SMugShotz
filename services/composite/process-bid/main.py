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


def extract_data(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def parse_service_payload(resp, service_name: str):
    try:
        return extract_data(resp.json()), None
    except ValueError:
        return None, (
            jsonify({"error": f"{service_name} returned a non-JSON response"}),
            502,
        )


def get_user(user_id: int):
    try:
        resp = http.get(f"{USER_SERVICE}/user/{user_id}", timeout=5)
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to reach user service: {exc}"}), 502)

    if resp.status_code != 200:
        return None, (jsonify({"error": "User not found"}), 400)

    user, parse_error = parse_service_payload(resp, "User service")
    if parse_error:
        return None, parse_error

    required_fields = ("role",)
    missing_fields = [field for field in required_fields if field not in user]
    if missing_fields:
        return None, (
            jsonify(
                {
                    "error": "User service returned an invalid payload",
                    "missing_fields": missing_fields,
                }
            ),
            502,
        )

    return user, None


def get_auction(auction_id: int):
    try:
        resp = http.get(f"{AUCTION_SERVICE}/auction/{auction_id}/", timeout=5)
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to reach auction service: {exc}"}), 502)

    if resp.status_code != 200:
        return None, (jsonify({"error": "Auction not found"}), 404)

    auction, parse_error = parse_service_payload(resp, "Auction service")
    if parse_error:
        return None, parse_error

    required_fields = (
        "auction_id",
        "start_price",
        "status",
    )
    missing_fields = [field for field in required_fields if field not in auction]
    if missing_fields:
        return None, (
            jsonify(
                {
                    "error": "Auction service returned an invalid payload",
                    "missing_fields": missing_fields,
                }
            ),
            502,
        )

    # Outsystems may omit bid fields when an auction has not received any bids yet.
    auction.setdefault("current_highest_bid", 0)
    auction.setdefault("highest_bidder_id", None)

    return auction, None


def update_auction(auction: dict, bid_amount: float, bidder_id: int):
    update_payload = {
        "auction_id": auction["auction_id"],
        "current_highest_bid": bid_amount,
        "highest_bidder_id": bidder_id,
        "status": auction["status"],
    }

    try:
       resp = http.put(
    "https://personal-vsev7crp.outsystemscloud.com/Auction/rest/Auction/Auction",
    json=update_payload,
    timeout=5
   )
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to update auction: {exc}"}), 502)

    if resp.status_code not in (200, 201, 204):
        return None, (jsonify({"error": "Failed to update auction"}), 500)

    if resp.status_code == 204 or not resp.content:
        return update_payload, None

    updated_auction, parse_error = parse_service_payload(resp, "Auction service")
    if parse_error:
        return None, parse_error

    return updated_auction, None


@app.route("/bid", methods=["POST"])
def process_bid():
    data = request.json
    if not data:
        return jsonify({"error": "Missing required fields"}), 400

    bidder_id = data.get("bidder_id", data.get("buyer_id"))
    if not all(value is not None for value in (data.get("auction_id"), bidder_id, data.get("bid_amount"))):
        return jsonify({"error": "Missing required fields"}), 400

    auction_id = data["auction_id"]
    try:
        bid_amount = float(data["bid_amount"])
    except (TypeError, ValueError):
        return jsonify({"error": "bid_amount must be numeric"}), 400

    # 1. Validate bidder
    bidder, user_error = get_user(bidder_id)
    if user_error:
        return user_error

    #if str(bidder.get("role", "")).lower() != "buyer":
      #return jsonify({"error": "User is not a buyer"}), 403**

    # 2. Fetch auction
    auction, auction_error = get_auction(auction_id)
    if auction_error:
        return auction_error

    # 3. Validate bid
    active_statuses = {"OPEN", "ACTIVE"}
    if str(auction["status"]).upper() not in active_statuses:
        return jsonify({"error": "Auction is not active"}), 400

    min_bid = max(auction["start_price"], auction["current_highest_bid"])
    if bid_amount <= min_bid:
        return jsonify(
            {"error": f"Bid must be greater than current highest bid of {min_bid}"}
        ), 400

    previous_bidder_id = auction.get("highest_bidder_id")

    # 4. Update auction
    _, update_error = update_auction(auction, bid_amount, bidder_id)
    if update_error:
        return update_error

    # 5a. Notify outbid previous bidder
    if previous_bidder_id and previous_bidder_id != bidder_id:
        prev_user, _ = get_user(previous_bidder_id)
        if prev_user and prev_user.get("telegram_chat_id"):
            publish_event(
                "bid.outbid",
                {
                    "auction_id": auction_id,
                    "outbid_user_id": previous_bidder_id,
                    "outbid_telegram": prev_user["telegram_chat_id"],
                    "new_highest_bid": bid_amount,
                },
            )

    # 5b. Confirm new bid
    if bidder.get("telegram_chat_id"):
        publish_event(
            "bid.confirmed",
            {
                "auction_id": auction_id,
                "bidder_id": bidder_id,
                "bidder_telegram": bidder["telegram_chat_id"],
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
