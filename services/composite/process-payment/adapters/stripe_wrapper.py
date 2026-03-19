import os
import stripe

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
SUCCESS_URL = os.environ.get("PAYMENT_SUCCESS_URL", "http://localhost/payment/success")
CANCEL_URL = os.environ.get("PAYMENT_CANCEL_URL", "http://localhost/payment/cancel")


def create_checkout_session(order_id: int, amount_sgd: float, description: str) -> dict:
    """
    Create a Stripe Checkout Session.
    Returns {"session_id": str, "checkout_url": str}.
    """
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "sgd",
                    "product_data": {"name": description},
                    "unit_amount": int(amount_sgd * 100),  # cents
                },
                "quantity": 1,
            }
        ],
        mode="payment",
        success_url=f"{SUCCESS_URL}?order_id={order_id}&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{CANCEL_URL}?order_id={order_id}",
        metadata={"order_id": str(order_id)},
    )
    return {"session_id": session.id, "checkout_url": session.url}


def retrieve_session(session_id: str) -> dict:
    """Retrieve a Checkout Session by ID."""
    session = stripe.checkout.Session.retrieve(session_id)
    return {
        "session_id": session.id,
        "payment_status": session.payment_status,
        "payment_intent": session.payment_intent,
        "amount_total": session.amount_total,
    }
