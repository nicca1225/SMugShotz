from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:root@mysql:3306/orderdb"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    auction_id = db.Column(db.Integer, nullable=False)
    buyer_id = db.Column(db.Integer, nullable=False)
    seller_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), default="pending")
    created_at = db.Column(db.DateTime, server_default=db.func.now())


with app.app_context():
    db.create_all()

# Start gRPC server in background thread at startup (not inside __main__ so it runs under any runner)
import threading
from grpc_server import serve as grpc_serve
_grpc_thread = threading.Thread(target=grpc_serve, args=(app, db, Order), daemon=True)
_grpc_thread.start()


@app.route("/order", methods=["POST"])
def create_order():
    data = request.json
    if not data or not all(k in data for k in ("auction_id", "buyer_id", "seller_id", "amount")):
        return jsonify({"error": "Invalid order data"}), 400
    order = Order(
        auction_id=data["auction_id"],
        buyer_id=data["buyer_id"],
        seller_id=data["seller_id"],
        amount=data["amount"],
        status=data.get("status", "pending"),
    )
    db.session.add(order)
    db.session.commit()
    return (
        jsonify(
            {
                "order_id": order.id,
                "auction_id": order.auction_id,
                "buyer_id": order.buyer_id,
                "seller_id": order.seller_id,
                "amount": order.amount,
                "status": order.status,
            }
        ),
        201,
    )


@app.route("/order/<int:order_id>", methods=["GET"])
def get_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    return jsonify(
        {
            "order_id": order.id,
            "auction_id": order.auction_id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "amount": order.amount,
            "status": order.status,
        }
    )


@app.route("/order/<int:order_id>", methods=["PUT"])
def update_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    data = request.json
    if "status" in data:
        order.status = data["status"]
    db.session.commit()
    return jsonify({"message": "Order updated"})


@app.route("/order/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    db.session.delete(order)
    db.session.commit()
    return jsonify({"message": "Order deleted"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004, debug=False)
