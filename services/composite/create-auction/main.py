"""
Create Auction Composite Service
POST /auction/create

Flow:
1. Verify seller exists (User Service)
2. Upload image(s) to AWS S3
3. Detect camera via Google Cloud Vision
4. Detect damage / get condition score
5. Get suggested price from Price Model
6. Create Camera record (Camera Service)
7. Create Auction record (Auction Service)
8. Publish auction.created event to RabbitMQ
"""

import os
import uuid
import json
import pika
from flask import Flask, request, jsonify
from flask_cors import CORS
from adapters.s3_wrapper import upload_image
from adapters.vision_wrapper import detect_camera, detect_damage
from adapters.price_model_wrapper import predict_price
import requests as http

app = Flask(__name__)
CORS(app)

USER_SERVICE = os.environ.get("USER_SERVICE_URL", "http://user:5001")
CAMERA_SERVICE = os.environ.get("CAMERA_SERVICE_URL", "http://camera:5002")
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


@app.route("/auction/create", methods=["POST"])
def create_auction():
    data = request.form.to_dict()
    image_file = request.files.get("image")

    seller_id = data.get("seller_id")
    model = data.get("model")
    shutter_count = data.get("shutter_count")
    end_time = data.get("end_time")

    if not all([seller_id, model, end_time]):
        return jsonify({"error": "Missing required fields: seller_id, model, end_time"}), 400

    # 1. Verify seller
    user_resp = http.get(f"{USER_SERVICE}/user/{seller_id}", timeout=5)
    if user_resp.status_code != 200:
        return jsonify({"error": "User not found"}), 400
    seller = user_resp.json()
    if seller.get("role") != "seller":
        return jsonify({"error": "User is not a seller"}), 403

    # 2. Upload image to S3
    s3_url = None
    if image_file:
        image_bytes = image_file.read()
        key = f"listings/{seller_id}/{uuid.uuid4()}.jpg"
        s3_url = upload_image(image_bytes, key)

    # 3 & 4. Vision checks
    if s3_url:
        cam_result = detect_camera(s3_url)
        if not cam_result["camera_detected"]:
            return jsonify({"error": "NO CAMERA DETECTED"}), 400

        dmg_result = detect_damage(s3_url)
        condition_score = dmg_result["condition_score"]
        if dmg_result["faulty"]:
            return jsonify(
                {"error": "FAULTY CAMERA", "issues": dmg_result["issues"]}
            ), 400
    else:
        condition_score = float(data.get("condition_score", 0.8))

    # 5. Suggested price
    try:
        price_data = predict_price(
            model=model,
            age_years=float(data.get("age_years", 2)),
            condition_score=condition_score,
        )
        suggested_price = price_data.get("suggested_price", 0.0)
    except Exception as e:
        app.logger.warning(f"Price model unavailable: {e}")
        suggested_price = 0.0

    # 6. Create Camera record
    cam_payload = {
        "seller_id": int(seller_id),
        "model": model,
        "shutter_count": int(shutter_count) if shutter_count else None,
        "condition_score": condition_score,
        "s3_image_url": s3_url,
        "status": "active",
    }
    cam_resp = http.post(f"{CAMERA_SERVICE}/camera", json=cam_payload, timeout=5)
    if cam_resp.status_code != 201:
        return jsonify({"error": "Failed to create camera listing"}), 500
    camera_id = cam_resp.json()["camera_id"]

    # 7. Create Auction record
    start_price = float(data.get("start_price", suggested_price))
    auction_payload = {
        "camera_id": camera_id,
        "seller_id": int(seller_id),
        "start_price": start_price,
        "end_time": end_time,
    }
    auc_resp = http.post(f"{AUCTION_SERVICE}/auction", json=auction_payload, timeout=5)
    if auc_resp.status_code != 201:
        return jsonify({"error": "Failed to create auction"}), 500
    auction = auc_resp.json()

    # 8. Publish event
    publish_event(
        "auction.created",
        {
            "auction_id": auction["auction_id"],
            "camera_id": camera_id,
            "seller_id": int(seller_id),
            "seller_telegram": seller.get("telegram_handle"),
            "model": model,
            "start_price": start_price,
            "suggested_price": suggested_price,
            "condition_score": condition_score,
        },
    )

    return jsonify(
        {
            "auction_id": auction["auction_id"],
            "camera_id": camera_id,
            "start_price": start_price,
            "suggested_price": suggested_price,
            "condition_score": condition_score,
            "end_time": end_time,
            "status": "active",
        }
    ), 201


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5010, debug=True)
