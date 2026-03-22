from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:root@mysql:3306/paymentdb"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Payment(db.Model):
    __tablename__ = "payments"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(db.Integer, nullable=False)
    stripe_payment_id = db.Column(db.String(255))
    amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), default="pending")
    created_at = db.Column(db.DateTime, server_default=db.func.now())


with app.app_context():
    db.create_all()


@app.route("/payment", methods=["POST"])
def create_payment():
    data = request.json
    if not data or not all(k in data for k in ("order_id", "amount")):
        return jsonify({"error": "Invalid payment data"}), 400
    payment = Payment(
        order_id=data["order_id"],
        stripe_payment_id=data.get("stripe_payment_id"),
        amount=data["amount"],
        status=data.get("status", "pending"),
    )
    db.session.add(payment)
    db.session.commit()
    return (
        jsonify(
            {
                "payment_id": payment.id,
                "order_id": payment.order_id,
                "amount": payment.amount,
                "status": payment.status,
            }
        ),
        201,
    )


@app.route("/payment/<int:payment_id>", methods=["GET"])
def get_payment(payment_id):
    payment = db.session.get(Payment, payment_id)
    if not payment:
        return jsonify({"error": "Payment not found"}), 404
    return jsonify(
        {
            "payment_id": payment.id,
            "order_id": payment.order_id,
            "stripe_payment_id": payment.stripe_payment_id,
            "amount": payment.amount,
            "status": payment.status,
        }
    )


@app.route("/payment/<int:payment_id>", methods=["PUT"])
def update_payment(payment_id):
    payment = db.session.get(Payment, payment_id)
    if not payment:
        return jsonify({"error": "Payment not found"}), 404
    data = request.json
    if not data or "status" not in data:
        return jsonify({"error": "Status is required"}), 400
    payment.status = data["status"]
    db.session.commit()
    return jsonify({"message": "Payment updated", "payment_id": payment.id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)
