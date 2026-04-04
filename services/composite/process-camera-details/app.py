import os
import uuid
import logging
from datetime import datetime
import requests
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError, PartialCredentialsError
from google.cloud import vision
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# Assume its base URL comes from environment variable with a reasonable default
PRICE_MODEL_URL = os.environ.get('PRICE_MODEL_URL', 'http://localhost:5000/predict-price')
CAMERA_SERVICE_URL = os.environ.get("CAMERA_SERVICE_URL", "http://camera:5002")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
CAMERA_KEYWORDS = {
    "camera", "camera lens", "photographic equipment", "digital camera", "lens", "slr", "reflex camera", "photography"
}


def format_error_response(code, message, status_code, errors=None):
    payload = {
        "code": code,
        "message": message
    }
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status_code


def format_success_response(data, message="Camera details processed successfully.", code=200):
    return jsonify({
        "code": code,
        "message": message,
        "data": data
    }), code


def allowed_file(filename):
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _guess_content_type(filename, provided_content_type):
    if provided_content_type and provided_content_type != "application/octet-stream":
        return provided_content_type

    ext = os.path.splitext(filename or "")[1].lower()
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "application/octet-stream"


def build_s3_key(seller_id, filename):
    safe_filename = secure_filename(filename or "image")
    safe_seller_id = secure_filename(str(seller_id or "unknown-seller")) or "unknown-seller"
    ext = os.path.splitext(safe_filename)[1].lower()
    date_segment = datetime.utcnow().strftime("%Y/%m/%d")
    return f"sellers/{safe_seller_id}/{date_segment}/{uuid.uuid4()}{ext}"


def validate_required_env_vars():
    required_vars = [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_REGION",
        "AWS_S3_BUCKET",
        "GOOGLE_APPLICATION_CREDENTIALS"
    ]
    missing = [env_name for env_name in required_vars if not os.environ.get(env_name)]
    return len(missing) == 0, missing


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION")
    )

def validate_input(form, files):
    """
    Validate all incoming multipart/form-data fields:
    - brand is required and cannot be blank
    - model is required and cannot be blank
    - shutter_count is required, must be integer, and cannot be negative
    - image file is required
    """
    errors = []
    parsed = {}
    
    brand = form.get('brand')
    model = form.get('model')
    
    if not brand or not str(brand).strip():
        errors.append("brand is required and cannot be blank")
    else:
        parsed['brand'] = str(brand).strip().lower()
        
    if not model or not str(model).strip():
        errors.append("model is required and cannot be blank")
    else:
        parsed['model'] = str(model).strip().lower()
        
    try:
        shutter_count = form.get('shutter_count')
        if shutter_count is None:
            raise ValueError
        parsed['shutter_count'] = int(shutter_count)
        if parsed['shutter_count'] < 0:
            errors.append("shutter_count cannot be negative")
    except (ValueError, TypeError):
        errors.append("shutter_count is required and must be an integer")
        
    image_files = files.getlist("image") if hasattr(files, "getlist") else []
    image_files = [f for f in image_files if f and f.filename]
    if not image_files and 'image' in files and files['image'].filename:
        image_files = [files['image']]

    if not image_files:
        errors.append("image is required")
    else:
        validated_filenames = []
        for file_storage in image_files:
            filename = secure_filename(file_storage.filename)
            if not allowed_file(filename):
                errors.append(f"{filename or 'image'} must be one of: jpg, jpeg, png, webp")
                continue
            validated_filenames.append(filename)
        parsed["image_filenames"] = validated_filenames
        
    return len(errors) == 0, parsed, errors

def upload_file_to_s3(file, seller_id):
    """
    Upload file to AWS S3.
    """
    key = build_s3_key(seller_id=seller_id, filename=file.filename)
    s3_client = get_s3_client()
    bucket = os.environ.get("AWS_S3_BUCKET")
    
    try:
        file.stream.seek(0)
        safe_filename = secure_filename(file.filename or "image")
        s3_client.upload_fileobj(
            file.stream,
            bucket,
            key,
            ExtraArgs={
                "ContentType": _guess_content_type(safe_filename, file.content_type),
                "Metadata": {
                    "seller_id": str(seller_id),
                    "original_filename": safe_filename
                }
            }
        )
    except (ClientError, BotoCoreError, NoCredentialsError, PartialCredentialsError) as e:
        logger.exception("Error uploading to S3")
        raise RuntimeError("s3_upload_failed") from e

    region = os.environ.get("AWS_REGION")
    return {
        "bucket": bucket,
        "key": key,
        "url": f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    }

def get_image_bytes_from_s3(bucket, key):
    s3_client = get_s3_client()
    try:
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except (ClientError, BotoCoreError, NoCredentialsError, PartialCredentialsError) as e:
        logger.exception("Error reading image from S3")
        raise RuntimeError("s3_read_failed") from e


def analyze_image_with_vision(image_bytes, user_brand, user_model):
    """
    Use real Google Cloud Vision to detect objects and text in the image.
    Computes a rule-based condition score.
    Returns: (is_valid, validation_data, condition_score)
    """
    try:
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=image_bytes)
        
        # 1. Label Detection
        label_response = client.label_detection(image=image)
        # 2. Text Detection
        text_response = client.text_detection(image=image)
        
        if label_response.error.message:
            raise Exception(f"Vision label error: {label_response.error.message}")
            
        if text_response.error.message:
            raise Exception(f"Vision text error: {text_response.error.message}")
            
    except Exception as e:
        logger.exception("Error calling Vision API")
        raise RuntimeError("vision_analysis_failed") from e
        
    labels = [
        {
            "description": label.description.lower(),
            "score": round(float(label.score), 4)
        }
        for label in label_response.label_annotations
    ]
    label_names = [label["description"] for label in labels]
    texts = [text.description.lower() for text in text_response.text_annotations]
    
    # Base text is the full content if available
    full_text = texts[0] if texts else ""
    
    # Check if camera related
    is_camera_related = any(kw in label_names for kw in CAMERA_KEYWORDS)
    
    brand_match = user_brand in full_text
    model_match = user_model in full_text
    camera_hints = []
    if brand_match:
        camera_hints.append({"type": "brand_match", "value": user_brand})
    if model_match:
        camera_hints.append({"type": "model_match", "value": user_model})
    
    # Validation Rules
    # If no camera related labels and no OCR support for the brand/model, it's not a camera
    if not is_camera_related and not brand_match and not model_match:
        return False, {
            "is_valid": False,
            "reason": "Uploaded image does not appear to be camera-related."
        }, None
        
    # Condition Score Logic
    score = 5.0
    
    if is_camera_related:
        score += 2.0
    else:
        score -= 3.0
        
    if brand_match:
        score += 1.5
    if model_match:
        score += 1.5
        
    if not texts:
        score -= 1.0
        
    # Clamp and round
    final_score = max(0.0, min(10.0, score))
    final_score = round(final_score, 1)
    
    validation_data = {
        "is_valid": True,
        "detected_labels": labels[:5],
        "detected_text": texts[0].split('\n') if texts else [],
        "brand_match": brand_match,
        "model_match": model_match,
        "camera_hints": camera_hints
    }
    
    return True, validation_data, final_score

def get_price_recommendation(brand, model, shutter_count, condition_score):
    """
    Call the existing price recommendation microservice.
    """
    payload = {
        "brand": brand,
        "model": model,
        "shutter_count": shutter_count,
        "condition_score": condition_score
    }
    
    try:
        response = requests.post(PRICE_MODEL_URL, json=payload, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        if data.get("code") == 200:
            price_data = data.get("data", {})
            return True, {
                "suggested_price": price_data.get("suggested_price"),
                "price_source": price_data.get("price_source"),
                "number_of_prices_used": price_data.get("number_of_prices_used")
            }
        else:
            return False, None
    except Exception as e:
        logger.exception("Error calling price service")
        return False, None


def create_camera_record(camera_payload):
    """
    Create a pending camera record in the atomic camera service.
    """
    try:
        response = requests.post(f"{CAMERA_SERVICE_URL}/camera", json=camera_payload, timeout=8)
    except requests.RequestException:
        logger.exception("Error calling camera service")
        return False, None, "Failed to save camera details."

    if response.status_code != 201:
        try:
            payload = response.json()
            error = payload.get("error") or payload.get("message") or "Failed to save camera details."
        except ValueError:
            error = f"Camera service returned HTTP {response.status_code}."
        return False, None, error

    try:
        return True, response.json(), None
    except ValueError:
        return False, None, "Camera service returned an invalid response."

@app.route('/process-camera-details', methods=['POST'])
def process_camera_details():
    is_env_valid, missing_env_vars = validate_required_env_vars()
    if not is_env_valid:
        logger.error("Missing environment variables: %s", ", ".join(missing_env_vars))
        return format_error_response(
            500,
            "Service configuration error.",
            500,
            errors=[f"Missing environment variables: {', '.join(missing_env_vars)}"]
        )

    # 1. Input validation from multipart/form-data
    is_valid_input, parsed_data, errors = validate_input(request.form, request.files)
    if not is_valid_input:
        return format_error_response(400, "Invalid input data.", 400, errors)
        
    image_files = request.files.getlist("image")
    image_files = [f for f in image_files if f and f.filename]
    if not image_files and "image" in request.files and request.files["image"].filename:
        image_files = [request.files["image"]]

    seller_id_raw = request.form.get("seller_id", "unknown-seller").strip() or "unknown-seller"
    raw_brand = request.form.get("brand", "").strip()
    raw_model = request.form.get("model", "").strip()
    seller_id = seller_id_raw

    analysis_items = []
    primary_condition_score = None

    for image_file in image_files:
        # 2. Upload image to S3 first
        try:
            s3_result = upload_file_to_s3(image_file, seller_id=seller_id)
            image_url = s3_result["url"]
        except RuntimeError as e:
            if str(e) == "s3_upload_failed":
                return format_error_response(500, "Failed to upload image.", 500)
            return format_error_response(500, "Unexpected upload error.", 500)

        # 3. Read uploaded image from S3 for Vision analysis
        try:
            image_bytes = get_image_bytes_from_s3(s3_result["bucket"], s3_result["key"])
        except RuntimeError as e:
            if str(e) == "s3_read_failed":
                return format_error_response(500, "Failed to read uploaded image from storage.", 500)
            return format_error_response(500, "Unexpected storage read error.", 500)

        # 4. Validate image & score using Google Cloud Vision
        try:
            is_camera, vision_result, condition_score = analyze_image_with_vision(
                image_bytes,
                parsed_data['brand'],
                parsed_data['model']
            )
        except RuntimeError as e:
            if str(e) == "vision_analysis_failed":
                return format_error_response(502, "Failed to analyze image with Vision API.", 502)
            return format_error_response(500, "Unexpected Vision analysis error.", 500)

        analysis_items.append(
            {
                "filename": secure_filename(image_file.filename or "image"),
                "storage": {
                    "bucket": s3_result["bucket"],
                    "key": s3_result["key"],
                    "image_url": image_url
                },
                "validation_result": vision_result,
                "condition_score": condition_score
            }
        )

        if primary_condition_score is None and is_camera:
            primary_condition_score = condition_score

    if primary_condition_score is None:
        return jsonify({
            "code": 400,
            "message": "Camera validation failed for all uploaded images.",
            "data": {
                "images": analysis_items
            }
        }), 400

    # 5. Call price recommendation microservice
    success, pricing_data = get_price_recommendation(
        parsed_data['brand'],
        parsed_data['model'],
        parsed_data['shutter_count'],
        primary_condition_score
    )
    
    if not success:
        return format_error_response(502, "Failed to get price recommendation.", 502)

    try:
        seller_id_int = int(seller_id_raw)
    except (TypeError, ValueError):
        return format_error_response(400, "Invalid seller_id.", 400, errors=["seller_id must be an integer"])

    camera_payload = {
        "seller_id": seller_id_int,
        "model": f"{raw_brand} {raw_model}".strip(),
        "shutter_count": parsed_data["shutter_count"],
        "condition_score": primary_condition_score,
        "ai_condition_score": primary_condition_score,
        "s3_image_url": analysis_items[0]["storage"]["image_url"],
        "status": "pending",
    }

    camera_created, camera_data, camera_error = create_camera_record(camera_payload)
    if not camera_created:
        return format_error_response(502, camera_error, 502)

    camera_id = camera_data.get("camera_id")
    if not camera_id:
        return format_error_response(502, "Camera service returned no camera_id.", 502)

    # 6. Return one clean combined response
    return format_success_response(
        {
            "seller_id": seller_id,
            "camera_id": camera_id,
            "images": analysis_items,
            "condition_score": primary_condition_score,
            "pricing": pricing_data
        }
    )

if __name__ == '__main__':
    # Use port 5001 so it can run side-by-side with price-model on port 5000 locally
    app.run(host='0.0.0.0', port=5001)
