import json
import os
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

import pika
import requests as http
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

USER_SERVICE = os.environ.get(
    "USER_SERVICE_URL",
    "https://personal-vsev7crp.outsystemscloud.com/User/rest/User",
)
CAMERA_SERVICE = os.environ.get("CAMERA_SERVICE_URL", "http://camera:5002")
AUCTION_CREATE_URL = os.environ.get(
    "AUCTION_CREATE_URL",
    # Set this to your atomic Auction create endpoint in docker-compose.
    "https://personal-vsev7crp.outsystemscloud.com/Auction/rest/Auction/Auction",
)
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
DEFAULT_AUCTION_STATUS = os.environ.get("DEFAULT_AUCTION_STATUS", "OPEN")


def extract_data(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("data")
    return nested if isinstance(nested, dict) else payload


def parse_json_response(resp, service_name: str) -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[Any, int]]]:
    try:
        return extract_data(resp.json()), None
    except ValueError:
        return None, (
            jsonify({"error": f"{service_name} returned a non-JSON response", "raw": resp.text[:300]}),
            502,
        )


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


def publish_delayed_event(event_type: str, payload: dict, delay_ms: int):
    """Publish to the delayed exchange — message fires after delay_ms milliseconds."""
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.exchange_declare(
            exchange="digicam-delayed",
            exchange_type="x-delayed-message",
            durable=True,
            arguments={"x-delayed-type": "topic"},
        )
        ch.basic_publish(
            exchange="digicam-delayed",
            routing_key=event_type,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,
                headers={"x-delay": delay_ms},
            ),
        )
        conn.close()
        app.logger.info(f"Scheduled {event_type} in {delay_ms}ms ({delay_ms // 60000} min)")
    except Exception as exc:
        app.logger.warning(f"Failed to schedule {event_type}: {exc}")


def get_user(user_id: int):
    try:
        resp = http.get(f"{USER_SERVICE}/user/{user_id}", timeout=8)
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to reach user service: {exc}"}), 502)

    if resp.status_code != 200:
        return None, (jsonify({"error": "Seller not found"}), 404)

    user, parse_error = parse_json_response(resp, "User service")
    if parse_error:
        return None, parse_error

    return user, None


def get_camera(camera_id: int):
    try:
        resp = http.get(f"{CAMERA_SERVICE}/camera/{camera_id}", timeout=8)
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to reach camera service: {exc}"}), 502)

    if resp.status_code != 200:
        return None, (jsonify({"error": "Camera not found"}), 404)

    camera, parse_error = parse_json_response(resp, "Camera service")
    if parse_error:
        return None, parse_error

    return camera, None


def update_camera_status(camera_id: int, status: str):
    try:
        resp = http.put(
            f"{CAMERA_SERVICE}/camera/{camera_id}",
            json={"status": status},
            timeout=8,
        )
    except http.RequestException as exc:
        return False, f"Failed to reach camera service for update: {exc}"

    if resp.status_code != 200:
        try:
            payload = resp.json()
            details = payload.get("error") or payload.get("message") or resp.text[:300]
        except ValueError:
            details = resp.text[:300]
        return False, f"Camera status update failed: {details}"

    return True, None


def normalise_end_time(raw_end_time: Any):
    if raw_end_time is None:
        return None, (jsonify({"error": "end_time is required"}), 400)

    end_time = str(raw_end_time).strip()
    if not end_time:
        return None, (jsonify({"error": "end_time is required"}), 400)

    # HTML datetime-local gives values like 2026-04-05T14:30
    # If your OutSystems endpoint expects seconds, append :00.
    if len(end_time) == 16:
        end_time = f"{end_time}:00"

    return end_time, None


def build_create_payload(data: dict, camera: dict, s3_image_url: str = "") -> Tuple[Optional[dict], Optional[Tuple[Any, int]]]:
    seller_id = data.get("seller_id")
    camera_id = data.get("camera_id")
    start_price = data.get("start_price")
    end_time, end_time_error = normalise_end_time(data.get("end_time"))
    if end_time_error:
        return None, end_time_error

    if seller_id is None or camera_id is None or start_price is None:
        return None, (jsonify({"error": "seller_id, camera_id, start_price, and end_time are required"}), 400)

    try:
        seller_id = int(seller_id)
        camera_id = int(camera_id)
        start_price = float(start_price)
    except (TypeError, ValueError):
        return None, (jsonify({"error": "seller_id and camera_id must be integers; start_price must be numeric"}), 400)

    if start_price <= 0:
        return None, (jsonify({"error": "start_price must be greater than 0"}), 400)

    if int(camera.get("seller_id", -1)) != seller_id:
        return None, (jsonify({"error": "Camera does not belong to this seller"}), 403)

    if str(camera.get("status", "")).lower() == "listed":
        return None, (jsonify({"error": "This camera is already listed in an active auction"}), 409)

    # Keep this payload close to your existing frontend contract.
    # Add extra fields that atomic Auction services commonly expect.
    payload = {
        "seller_id": seller_id,
        "camera_id": camera_id,
        "start_price": start_price,
        "end_time": end_time,
        "status": DEFAULT_AUCTION_STATUS,
        "current_highest_bid": 0,
        "highest_bidder_id": None,
        "image_url": s3_image_url,
    }
    return payload, None


def create_auction(payload: dict):
    try:
        resp = http.post(AUCTION_CREATE_URL, json=payload, timeout=10)
    except http.RequestException as exc:
        return None, (jsonify({"error": f"Failed to reach auction service: {exc}"}), 502)

    if resp.status_code not in (200, 201):
        parsed = None
        try:
            parsed = resp.json()
        except ValueError:
            parsed = {"raw": resp.text[:300]}
        return None, (
            jsonify(
                {
                    "error": "Auction creation failed",
                    "status_code": resp.status_code,
                    "details": parsed,
                }
            ),
            502,
        )

    created, parse_error = parse_json_response(resp, "Auction service")
    if parse_error:
        return None, parse_error

    return created, None


@app.route("/auction/create", methods=["POST"])
def process_create_auction():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    seller_id = data.get("seller_id")
    camera_id = data.get("camera_id")
    if seller_id is None or camera_id is None:
        return jsonify({"error": "seller_id and camera_id are required"}), 400

    seller, seller_error = get_user(seller_id)
    if seller_error:
        return seller_error

    camera, camera_error = get_camera(camera_id)
    if camera_error:
        return camera_error

    create_payload, payload_error = build_create_payload(data, camera, s3_image_url=data.get("s3_image_url", ""))
    if payload_error:
        return payload_error

    created_auction, create_error = create_auction(create_payload)
    if create_error:
        return create_error

    camera_updated, camera_update_error = update_camera_status(create_payload["camera_id"], "listed")
    if not camera_updated:
        app.logger.warning(camera_update_error)

    auction_id = (
        created_auction.get("auction_id")
        or created_auction.get("id")
        or create_payload["camera_id"]
    )

    publish_event(
        "auction.created",
        {
            "auction_id": auction_id,
            "seller_id": create_payload["seller_id"],
            "seller_telegram": seller.get("telegram_chat_id") or seller.get("chat_id"),
            "camera_id": create_payload["camera_id"],
            "model": camera.get("model"),
            "start_price": create_payload["start_price"],
            "suggested_price": data.get("suggested_price"),
            "condition_score": camera.get("condition_score") or camera.get("ai_condition_score"),
        },
    )

    # Schedule automatic winner processing when auction expires
    try:
        end_dt = datetime.fromisoformat(create_payload["end_time"].replace("T", " "))
        delay_ms = max(0, int((end_dt - datetime.now()).total_seconds() * 1000))
        publish_delayed_event("auction.expired", {"auction_id": auction_id}, delay_ms)
    except Exception as exc:
        app.logger.warning(f"Could not schedule auction expiry: {exc}")

    return (
        jsonify(
            {
                "message": "Auction created successfully",
                "auction_id": auction_id,
                "data": created_auction,
                "camera_status_updated": camera_updated,
                **({"camera_status_warning": camera_update_error} if camera_update_error else {}),
            }
        ),
        201,
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "create-auction"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5010, debug=True)
