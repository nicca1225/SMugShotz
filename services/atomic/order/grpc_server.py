"""
gRPC server for the Order service.
Runs alongside the REST Flask app on port 50051.
Implements CreateOrder — used by process-winner for internal service-to-service calls.
"""

import grpc
from concurrent import futures
import order_pb2
import order_pb2_grpc


class OrderServicer(order_pb2_grpc.OrderServiceServicer):
    def __init__(self, flask_app, database, order_model):
        self._app = flask_app
        self._db = database
        self._Order = order_model

    def CreateOrder(self, request, context):
        with self._app.app_context():
            order = self._Order(
                auction_id=request.auction_id,
                buyer_id=request.buyer_id,
                seller_id=request.seller_id,
                amount=request.amount,
                status=request.status or "pending",
            )
            self._db.session.add(order)
            self._db.session.commit()

            print(f"[gRPC] Created order #{order.id} for auction #{order.auction_id}")

            return order_pb2.CreateOrderResponse(
                order_id=order.id,
                auction_id=order.auction_id,
                buyer_id=order.buyer_id,
                seller_id=order.seller_id,
                amount=order.amount,
                status=order.status,
            )


def serve(flask_app, database, order_model):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    order_pb2_grpc.add_OrderServiceServicer_to_server(
        OrderServicer(flask_app, database, order_model), server
    )
    server.add_insecure_port("[::]:50051")
    server.start()
    print("[gRPC] Order gRPC server started on port 50051")
    server.wait_for_termination()
