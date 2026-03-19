import boto3
import os
from botocore.exceptions import ClientError

_s3 = None


def _get_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            region_name=os.environ.get("AWS_REGION", "ap-southeast-1"),
        )
    return _s3


BUCKET = os.environ.get("S3_BUCKET", "digicam-images")


def upload_image(file_bytes: bytes, key: str, content_type: str = "image/jpeg") -> str:
    """Upload image bytes to S3 and return the public URL."""
    client = _get_client()
    client.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return f"https://{BUCKET}.s3.amazonaws.com/{key}"


def get_image_url(key: str) -> str:
    """Generate a pre-signed URL valid for 1 hour."""
    client = _get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=3600,
    )
