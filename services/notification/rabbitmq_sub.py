"""
RabbitMQ subscriber — binds to the 'digicam' topic exchange and routes events
to the appropriate Telegram notification handler.
"""

import os
import json
import pika
import requests
from adapters.telegram_wrapper import send_message

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
PROCESS_PAYMENT_URL = os.environ.get("PROCESS_PAYMENT_URL", "http://process-payment:5013")

ROUTING_KEYS = [
    "auction.created",
    "bid.confirmed",
    "bid.outbid",
    "winner.notify",
    "auction.failed",
    "order.confirmed",
]


def handle_auction_created(payload: dict):
    telegram = payload.get("seller_telegram")
    msg = (
        f"Your auction has been created!\n"
        f"Model: {payload.get('model')}\n"
        f"Start Price: SGD {payload.get('start_price')}\n"
        f"Suggested Price: SGD {payload.get('suggested_price')}\n"
        f"Condition Score: {payload.get('condition_score')}"
    )
    send_message(telegram, msg)


def handle_bid_confirmed(payload: dict):
    telegram = payload.get("bidder_telegram")
    msg = (
        f"Your bid of SGD {payload.get('bid_amount')} on auction "
        f"#{payload.get('auction_id')} has been confirmed!"
    )
    send_message(telegram, msg)


def handle_bid_outbid(payload: dict):
    telegram = payload.get("outbid_telegram")
    msg = (
        f"You have been outbid on auction #{payload.get('auction_id')}!\n"
        f"New highest bid: SGD {payload.get('new_highest_bid')}"
    )
    send_message(telegram, msg)


def handle_winner_notify(payload: dict):
    winner_telegram = payload.get("winner_telegram")
    seller_telegram = payload.get("seller_telegram")
    amount = payload.get("amount")
    auction_id = payload.get("auction_id")
    order_id = payload.get("order_id")

    # Get Stripe checkout URL from process-payment service
    checkout_url = None
    try:
        resp = requests.post(
            f"{PROCESS_PAYMENT_URL}/process-payment",
            json={
                "order_id": order_id,
                "amount": amount,
                "description": f"Digicam Auction #{auction_id}",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            checkout_url = resp.json().get("checkout_url")
    except Exception as e:
        print(f"[notification] Failed to get checkout URL: {e}")

    payment_line = f"\nPay here: {checkout_url}" if checkout_url else "\nPlease log in to complete your payment."

    send_message(
        winner_telegram,
        f"Congratulations! You won auction #{auction_id} with a bid of SGD {amount}.\n"
        f"Order #{order_id} created.{payment_line}",
    )
    send_message(
        seller_telegram,
        f"Your auction #{auction_id} has ended! Winning bid: SGD {amount}.\n"
        f"The buyer has been notified to complete payment.",
    )


def handle_auction_failed(payload: dict):
    reason = payload.get("reason", "unknown")
    msg = (
        f"Auction #{payload.get('auction_id')} has failed.\n"
        f"Reason: {reason}. Please re-list your item."
    )
    # In a full implementation, we'd look up all bidder telegrams here
    # For now log it
    print(f"[notification] auction.failed: {payload}")


def handle_order_confirmed(payload: dict):
    telegram = payload.get("buyer_telegram")
    msg = (
        f"Your order #{payload.get('order_id')} has been confirmed!\n"
        f"The seller will be in touch soon."
    )
    send_message(telegram, msg)


HANDLERS = {
    "auction.created": handle_auction_created,
    "bid.confirmed": handle_bid_confirmed,
    "bid.outbid": handle_bid_outbid,
    "winner.notify": handle_winner_notify,
    "auction.failed": handle_auction_failed,
    "order.confirmed": handle_order_confirmed,
}


def on_message(ch, method, properties, body):
    try:
        payload = json.loads(body)
        routing_key = method.routing_key
        print(f"[notification] Received {routing_key}: {payload}")
        handler = HANDLERS.get(routing_key)
        if handler:
            handler(payload)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f"[notification] Error processing message: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start():
    import time
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 60
            conn = pika.BlockingConnection(params)
            ch = conn.channel()
            ch.exchange_declare(exchange="digicam", exchange_type="topic", durable=True)
            result = ch.queue_declare(queue="notification", durable=True)
            queue_name = result.method.queue

            for key in ROUTING_KEYS:
                ch.queue_bind(exchange="digicam", queue=queue_name, routing_key=key)

            ch.basic_qos(prefetch_count=1)
            ch.basic_consume(queue=queue_name, on_message_callback=on_message)
            print("[notification] Waiting for messages...")
            ch.start_consuming()
        except Exception as e:
            print(f"[notification] Connection lost: {e}. Retrying in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    start()
