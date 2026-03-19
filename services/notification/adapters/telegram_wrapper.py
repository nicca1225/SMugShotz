import os
import requests

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"


def send_message(chat_id: str, text: str) -> bool:
    """Send a plain-text Telegram message. Returns True on success."""
    if not chat_id or not BOT_TOKEN:
        return False
    resp = requests.post(
        f"{BASE_URL}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=10,
    )
    return resp.status_code == 200


def send_photo(chat_id: str, photo_url: str, caption: str = "") -> bool:
    """Send a photo by URL."""
    if not chat_id or not BOT_TOKEN:
        return False
    resp = requests.post(
        f"{BASE_URL}/sendPhoto",
        json={"chat_id": chat_id, "photo": photo_url, "caption": caption},
        timeout=10,
    )
    return resp.status_code == 200
