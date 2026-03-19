from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:root@mysql:3306/cameradb"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Camera(db.Model):
    __tablename__ = "cameras"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    seller_id = db.Column(db.Integer, nullable=False)
    model = db.Column(db.String(255), nullable=False)
    shutter_count = db.Column(db.Integer)
    description = db.Column(db.Text)
    condition_score = db.Column(db.Float)
    ai_condition_score = db.Column(db.Float)
    s3_image_url = db.Column(db.String(512))
    status = db.Column(db.String(50), default="pending")
    created_at = db.Column(db.DateTime, server_default=db.func.now())


with app.app_context():
    db.create_all()


@app.route("/camera", methods=["POST"])
def create_camera():
    data = request.json
    if not data or not all(k in data for k in ("seller_id", "model")):
        return jsonify({"error": "Missing required fields"}), 400
    camera = Camera(
        seller_id=data["seller_id"],
        model=data["model"],
        shutter_count=data.get("shutter_count"),
        description=data.get("description"),
        condition_score=data.get("condition_score"),
        ai_condition_score=data.get("ai_condition_score"),
        s3_image_url=data.get("s3_image_url"),
        status=data.get("status", "pending"),
    )
    db.session.add(camera)
    db.session.commit()
    return (
        jsonify(
            {
                "camera_id": camera.id,
                "seller_id": camera.seller_id,
                "model": camera.model,
                "status": camera.status,
            }
        ),
        201,
    )


@app.route("/camera/<int:camera_id>", methods=["GET"])
def get_camera(camera_id):
    camera = db.session.get(Camera, camera_id)
    if not camera:
        return jsonify({"error": "Camera not found"}), 404
    return jsonify(
        {
            "camera_id": camera.id,
            "seller_id": camera.seller_id,
            "model": camera.model,
            "shutter_count": camera.shutter_count,
            "description": camera.description,
            "condition_score": camera.condition_score,
            "ai_condition_score": camera.ai_condition_score,
            "s3_image_url": camera.s3_image_url,
            "status": camera.status,
        }
    )


@app.route("/camera/<int:camera_id>", methods=["PUT"])
def update_camera(camera_id):
    camera = db.session.get(Camera, camera_id)
    if not camera:
        return jsonify({"error": "Camera not found"}), 404
    data = request.json
    allowed = {
        "condition_score",
        "ai_condition_score",
        "s3_image_url",
        "status",
        "description",
    }
    for key, val in data.items():
        if key in allowed:
            setattr(camera, key, val)
    db.session.commit()
    return jsonify({"message": "Camera updated", "camera_id": camera.id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
