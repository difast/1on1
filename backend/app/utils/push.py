import httpx
from typing import Optional

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push(token: Optional[str], title: str, body: str, data: dict = None) -> None:
    if not token or not token.startswith("ExponentPushToken"):
        return
    message = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
    }
    if data:
        message["data"] = data
    try:
        with httpx.Client(timeout=10) as client:
            client.post(EXPO_PUSH_URL, json=[message])
    except Exception:
        pass


def send_push_bulk(messages: list) -> None:
    valid = [m for m in messages if m.get("to", "").startswith("ExponentPushToken")]
    if not valid:
        return
    try:
        with httpx.Client(timeout=15) as client:
            client.post(EXPO_PUSH_URL, json=valid)
    except Exception:
        pass
