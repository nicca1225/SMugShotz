"""
Notification Service entry point.
Starts the RabbitMQ subscriber in the main thread.
Also exposes a minimal HTTP health endpoint.
"""

import threading
from flask import Flask, jsonify
import rabbitmq_sub

app = Flask(__name__)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Start RabbitMQ consumer in background thread
    t = threading.Thread(target=rabbitmq_sub.start, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5020)
