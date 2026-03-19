import os
import requests

# Google Cloud Vision REST API
VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"
API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")


def _annotate(image_url: str, features: list) -> dict:
    payload = {
        "requests": [
            {
                "image": {"source": {"imageUri": image_url}},
                "features": features,
            }
        ]
    }
    resp = requests.post(f"{VISION_API_URL}?key={API_KEY}", json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()["responses"][0]


def detect_camera(image_url: str) -> dict:
    """
    Returns {"camera_detected": bool, "confidence": float, "labels": list}.
    Uses LABEL_DETECTION to check if a camera is present.
    """
    result = _annotate(image_url, [{"type": "LABEL_DETECTION", "maxResults": 10}])
    labels = result.get("labelAnnotations", [])
    camera_labels = {"camera", "digital camera", "mirrorless camera", "dslr", "lens"}
    detected = any(l["description"].lower() in camera_labels for l in labels)
    confidence = max(
        (l["score"] for l in labels if l["description"].lower() in camera_labels),
        default=0.0,
    )
    return {
        "camera_detected": detected,
        "confidence": confidence,
        "labels": [l["description"] for l in labels],
    }


def detect_damage(image_url: str) -> dict:
    """
    Returns {"faulty": bool, "condition_score": float, "issues": list}.
    Uses OBJECT_LOCALIZATION + LABEL_DETECTION to assess condition.
    """
    result = _annotate(
        image_url,
        [
            {"type": "LABEL_DETECTION", "maxResults": 15},
            {"type": "SAFE_SEARCH_DETECTION"},
        ],
    )
    labels = result.get("labelAnnotations", [])
    damage_keywords = {"scratch", "crack", "broken", "damaged", "worn", "rust", "dent"}
    issues = [l["description"] for l in labels if l["description"].lower() in damage_keywords]
    condition_score = max(0.0, 1.0 - len(issues) * 0.2)
    return {
        "faulty": len(issues) > 2,
        "condition_score": round(condition_score, 2),
        "issues": issues,
    }
