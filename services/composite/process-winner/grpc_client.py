"""
gRPC client for creating orders.
Used by process-winner to call the order service internally via gRPC instead of REST.
"""

import grpc
import order_pb2
import order_pb2_grpc


def create_order_grpc(order_grpc_url, auction_id, buyer_id, seller_id, amount, status="pending"):
    """
    Create an order via gRPC.
    Returns (order_id, error_message).
    """
    try:
        with grpc.insecure_channel(order_grpc_url) as channel:
            grpc.channel_ready_future(channel).result(timeout=5)
            stub = order_pb2_grpc.OrderServiceStub(channel)
            response = stub.CreateOrder(
                order_pb2.CreateOrderRequest(
                    auction_id=auction_id,
                    buyer_id=buyer_id,
                    seller_id=seller_id,
                    amount=amount,
                    status=status,
                ),
                timeout=10,
            )
            return {"order_id": response.order_id, "amount": response.amount}, None
    except grpc.RpcError as e:
        return None, f"gRPC error: {e.code()} — {e.details()}"
    except Exception as e:
        return None, f"gRPC unexpected error: {e}"
