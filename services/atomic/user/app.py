from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:root@mysql:3306/userdb"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    telegram_id = db.Column(db.String(255))
    role = db.Column(db.Enum("buyer", "seller"), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())


with app.app_context():
    db.create_all()


@app.route("/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 400
    return jsonify(
        {
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "telegram_handle": user.telegram_id,
            "role": user.role,
        }
    )


@app.route("/user", methods=["POST"])
def create_user():
    data = request.json
    if not data or not all(k in data for k in ("name", "email", "role")):
        return jsonify({"error": "Missing required fields"}), 400
    user = User(
        name=data["name"],
        email=data["email"],
        telegram_id=data.get("telegram_handle"),
        role=data["role"],
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"user_id": user.id, "name": user.name, "email": user.email}), 201


@app.route("/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    data = request.json
    allowed = {"name", "email", "telegram_id", "role"}
    for key, val in data.items():
        if key in allowed:
            setattr(user, key, val)
    db.session.commit()
    return jsonify({"message": "User updated"})


@app.route("/user/<int:user_id>/role", methods=["GET"])
def get_user_role(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 400
    return jsonify({"user_id": user.id, "role": user.role})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
