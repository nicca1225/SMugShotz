"""
Notification Service entry point.
Starts the RabbitMQ subscriber in the main thread.
Also exposes a minimal HTTP health endpoint.
"""

import threading
from flask import Flask, jsonify
from flask_cors import CORS
import rabbitmq_sub

app = Flask(__name__)
CORS(app)

_consumer_thread = threading.Thread(target=rabbitmq_sub.start, daemon=True)
_consumer_thread.start()


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5020)
