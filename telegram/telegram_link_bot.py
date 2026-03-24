import requests
import telebot

BOT_TOKEN = "8745556745:AAFxB9J8c7CumI2KP2ZfnRkCrfYCka5mYcA"
UPDATE_USER_URL = "https://personal-vsev7crp.outsystemscloud.com/User/rest/User/User"

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['start'])
def handle_start(message):
    chat_id = str(message.chat.id)
    text = message.text.strip()

    if text.startswith("/start USER_"):
        user_id = text.replace("/start USER_", "").strip()

        photo_url = ""
        try:
            photos = bot.get_user_profile_photos(message.chat.id, limit=1)
            if photos.total_count > 0:
                file_id = photos.photos[0][-1].file_id
                file_info = bot.get_file(file_id)
                photo_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info.file_path}"
        except Exception:
            pass

        payload = {
            "user_id": int(user_id),
            "telegram_chat_id": chat_id,
            "telegram_photo_url": photo_url
        }

        try:
            response = requests.put(UPDATE_USER_URL, json=payload, timeout=10)

            if response.ok:
                bot.send_message(
                    message.chat.id,
                    f"Telegram linked successfully to user {user_id}."
                )
            else:
                bot.send_message(
                    message.chat.id,
                    f"Failed to link Telegram. Server returned {response.status_code}."
                )
        except Exception as e:
            bot.send_message(
                message.chat.id,
                f"Error linking Telegram: {e}"
            )
    else:
        bot.send_message(
            message.chat.id,
            "Hi! Please connect from the signup page so I can link your Telegram to your account."
        )

bot.infinity_polling()