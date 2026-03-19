import os
import requests

PRICE_MODEL_URL = os.environ.get("PRICE_MODEL_URL", "http://price-model:5100")


def predict_price(model: str, age_years: float, condition_score: float) -> dict:
    """
    Calls the scikit-learn price model service.
    Returns {"suggested_price": float, "price_range": {"low": float, "high": float}}.
    """
    params = {
        "model": model,
        "age": age_years,
        "condition": condition_score,
    }
    resp = requests.get(f"{PRICE_MODEL_URL}/predict", params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()
