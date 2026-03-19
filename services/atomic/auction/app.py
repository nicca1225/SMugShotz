from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://root:root@mysql:3306/auctiondb"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Auction(db.Model):
    __tablename__ = "auctions"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    camera_id = db.Column(db.Integer, nullable=False)
    seller_id = db.Column(db.Integer, nullable=False)
    start_price = db.Column(db.Float, nullable=False)
    current_highest_bid = db.Column(db.Float, default=0.0)
    highest_bidder_id = db.Column(db.Integer)
    end_time = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.Enum("active", "completed", "failed"), default="active")


with app.app_context():
    db.create_all()


@app.route("/auction", methods=["GET"])
def list_auctions():
    status_filter = request.args.get("status")
    query = Auction.query
    if status_filter:
        query = query.filter_by(status=status_filter)
    auctions = query.order_by(Auction.id.desc()).all()
    return jsonify(
        [
            {
                "auction_id": a.id,
                "camera_id": a.camera_id,
                "seller_id": a.seller_id,
                "start_price": a.start_price,
                "current_highest_bid": a.current_highest_bid,
                "highest_bidder_id": a.highest_bidder_id,
                "end_time": str(a.end_time),
                "status": a.status,
            }
            for a in auctions
        ]
    )


@app.route("/auction", methods=["POST"])
def create_auction():
    data = request.json
    if not data or not all(k in data for k in ("camera_id", "seller_id", "start_price", "end_time")):
        return jsonify({"error": "Invalid auction data"}), 400
    auction = Auction(
        camera_id=data["camera_id"],
        seller_id=data["seller_id"],
        start_price=data["start_price"],
        current_highest_bid=data.get("current_highest_bid", 0.0),
        end_time=data["end_time"],
        status="active",
    )
    db.session.add(auction)
    db.session.commit()
    return (
        jsonify(
            {
                "auction_id": auction.id,
                "camera_id": auction.camera_id,
                "start_price": auction.start_price,
                "end_time": str(auction.end_time),
                "status": auction.status,
            }
        ),
        201,
    )


@app.route("/auction/<int:auction_id>", methods=["GET"])
def get_auction(auction_id):
    auction = db.session.get(Auction, auction_id)
    if not auction:
        return jsonify({"error": "Auction not found"}), 404
    return jsonify(
        {
            "auction_id": auction.id,
            "camera_id": auction.camera_id,
            "seller_id": auction.seller_id,
            "start_price": auction.start_price,
            "current_highest_bid": auction.current_highest_bid,
            "highest_bidder_id": auction.highest_bidder_id,
            "end_time": str(auction.end_time),
            "status": auction.status,
        }
    )


@app.route("/auction/<int:auction_id>", methods=["PUT"])
def update_auction(auction_id):
    auction = db.session.get(Auction, auction_id)
    if not auction:
        return jsonify({"error": "Auction not found"}), 404
    data = request.json
    allowed = {"current_highest_bid", "highest_bidder_id", "status", "end_time"}
    for key, val in data.items():
        if key in allowed:
            setattr(auction, key, val)
    db.session.commit()
    return jsonify({"message": "Auction updated"})


@app.route("/auction/<int:auction_id>/winner", methods=["GET"])
def get_winner(auction_id):
    auction = db.session.get(Auction, auction_id)
    if not auction:
        return jsonify({"error": "Auction not found"}), 404
    return jsonify(
        {
            "auction_id": auction.id,
            "highest_bidder_id": auction.highest_bidder_id,
            "current_highest_bid": auction.current_highest_bid,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5003, debug=True)
