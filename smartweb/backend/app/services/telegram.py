"""Telegram-авторизация: проверка подлинности, работа с Bot API, привязка.

Единая логика для двух точек входа (бот и Login Widget): найти пользователя по
telegram_id, создать нового или связать с существующим аккаунтом по коду — так,
чтобы для одного человека не появлялось двух профилей (Этап 4).

Безопасность (Этап 5): данные Login Widget проверяются по HMAC-SHA256 с ключом
SHA256(bot_token); вебхук — по секретному заголовку. Токен бота только из env.
"""
import hashlib
import hmac
import json
import secrets
import string
import time
from datetime import datetime, timedelta
from urllib.parse import parse_qsl

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.telegram import TelegramLinkRequest

API_BASE = "https://api.telegram.org"
_CODE_TTL_MIN = 30
_WIDGET_MAX_AGE_SEC = 86400  # данные виджета старше суток не принимаем


def bot_token() -> str:
    return settings.telegram_bot_token or ""


# ---- Проверка подлинности --------------------------------------------------

def verify_login_widget(data: dict) -> bool:
    """Проверка hash из Telegram Login Widget по официальному алгоритму.
    secret = SHA256(bot_token); HMAC-SHA256(data_check_string, secret) == hash."""
    token = bot_token()
    if not token:
        return False
    received_hash = data.get("hash")
    if not received_hash:
        return False
    pairs = [f"{k}={data[k]}" for k in sorted(data) if k != "hash" and data[k] is not None]
    data_check_string = "\n".join(pairs)
    secret_key = hashlib.sha256(token.encode()).digest()
    calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, str(received_hash)):
        return False
    # Свежесть: не принимаем старые подписанные данные (replay-защита).
    try:
        auth_date = int(data.get("auth_date", 0))
        if auth_date and (time.time() - auth_date) > _WIDGET_MAX_AGE_SEC:
            return False
    except (TypeError, ValueError):
        return False
    return True


def verify_init_data(init_data: str) -> dict | None:
    """Проверка Telegram Mini App initData (Этап 1). Отличается от Login Widget
    только формулой ключа: secret = HMAC_SHA256("WebAppData", bot_token).
    Возвращает данные пользователя {id, first_name, username, photo_url} или None.
    """
    token = bot_token()
    if not token or not init_data:
        return None
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return None
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, str(received_hash)):
        return None
    try:
        auth_date = int(pairs.get("auth_date", 0))
        if auth_date and (time.time() - auth_date) > _WIDGET_MAX_AGE_SEC:
            return None
    except (TypeError, ValueError):
        return None
    try:
        u = json.loads(pairs.get("user", "{}"))
    except Exception:
        return None
    if not u.get("id"):
        return None
    return {
        "id": u.get("id"), "first_name": u.get("first_name"),
        "username": u.get("username"), "photo_url": u.get("photo_url"),
    }


def verify_webhook_secret(header_value: str | None) -> bool:
    """Проверка заголовка X-Telegram-Bot-Api-Secret-Token. Если секрет не задан
    в окружении — вебхук считаем неготовым и отклоняем (безопасный дефолт)."""
    secret = settings.telegram_webhook_secret or ""
    if not secret:
        return False
    return hmac.compare_digest(secret, header_value or "")


# ---- Коды привязки ----------------------------------------------------------

def gen_code(n: int = 6) -> str:
    """Короткий код без похожих символов (0/O, 1/I)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


def issue_link_code(db: Session, tg: dict) -> str:
    """Создать (или переиспользовать) код для привязки данного Telegram к
    существующему аккаунту. tg = {id, first_name, username, photo_url}."""
    code = gen_code()
    # На всякий случай гарантируем уникальность.
    while db.query(TelegramLinkRequest).filter(TelegramLinkRequest.code == code).first():
        code = gen_code()
    req = TelegramLinkRequest(
        code=code, telegram_id=int(tg["id"]),
        first_name=tg.get("first_name"), username=tg.get("username"),
        photo_url=tg.get("photo_url"),
        expires_at=datetime.utcnow() + timedelta(minutes=_CODE_TTL_MIN),
    )
    db.add(req); db.commit()
    return code


# ---- Пользователи -----------------------------------------------------------

def find_by_telegram_id(db: Session, tid: int) -> User | None:
    return db.query(User).filter(User.telegram_id == int(tid)).first()


def create_from_telegram(db: Session, tg: dict) -> User:
    """Создать пользователя по данным Telegram. Роль пустая — веб-онбординг
    попросит выбрать (тимлид/участник). Email отсутствует."""
    user = User(
        name=(tg.get("first_name") or tg.get("username") or "Пользователь")[:255],
        email=None,
        role="",
        telegram=(f"@{tg['username']}" if tg.get("username") else None),
        telegram_id=int(tg["id"]),
        avatar=tg.get("photo_url"),
    )
    db.add(user); db.commit(); db.refresh(user)
    # Бесплатный старт как и при обычной регистрации.
    try:
        from app.services import subscriptions as subs
        subs.start_signup_free(db, "user", user.id)
    except Exception:
        db.rollback()
    return user


def _user_has_data(db: Session, user: User) -> bool:
    """Есть ли у аккаунта собственные данные (команды как тимлид / встречи).
    Пустой bot-аккаунт (только /start) можно безопасно удалить при слиянии."""
    from app.models.team import Team
    from app.models.meeting import Meeting
    if db.query(Team).filter(Team.team_lead_id == user.id).first():
        return True
    if db.query(Meeting).filter(Meeting.team_lead_id == user.id).first():
        return True
    return False


def attach_telegram_to_user(db: Session, target: User, tg: dict) -> User:
    """Привязать telegram_id к аккаунту target (обычно email-аккаунт).
    Если этот telegram_id уже висит на ДРУГОМ аккаунте:
      - пустой (только /start) -> удаляем его, освобождая id (безопасное слияние);
      - с данными -> ошибка, чтобы не потерять чужие данные.
    """
    tid = int(tg["id"])
    existing = find_by_telegram_id(db, tid)
    if existing and existing.id != target.id:
        if _user_has_data(db, existing):
            raise ValueError("telegram_in_use")
        db.delete(existing); db.flush()
    target.telegram_id = tid
    if tg.get("username") and not target.telegram:
        target.telegram = f"@{tg['username']}"
    if tg.get("photo_url") and not target.avatar:
        target.avatar = tg.get("photo_url")
    db.commit(); db.refresh(target)
    return target


def resolve_web_login(db: Session, tg: dict, link_user_id: int | None = None):
    """Логика входа через Login Widget (Этапы 2-4).
    - link_user_id задан -> привязываем Telegram к этому аккаунту.
    - иначе нашли по telegram_id -> вход.
    - иначе создаём нового.
    Возвращает (user, status): status in login|created|linked.
    """
    if link_user_id:
        target = db.query(User).filter(User.id == link_user_id).first()
        if not target:
            raise ValueError("user_not_found")
        attach_telegram_to_user(db, target, tg)
        return target, "linked"
    user = find_by_telegram_id(db, int(tg["id"]))
    if user:
        return user, "login"
    return create_from_telegram(db, tg), "created"


# ---- Bot API ----------------------------------------------------------------

def notify_user(db: Session, user_id: int, title: str, body: str | None = None) -> None:
    """Продублировать пользовательское уведомление в Telegram, если у аккаунта
    привязан telegram_id. Безопасно для всех — у кого нет привязки, пропускаем."""
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if not u or not u.telegram_id:
            return
        text = title if not body else f"{title}\n{body}"
        send_message(u.telegram_id, text)
    except Exception:
        pass


def send_message(chat_id: int, text: str, reply_markup: dict | None = None) -> None:
    """Отправить текст пользователю. Ошибки глушим — не роняем вебхук."""
    token = bot_token()
    if not token:
        return
    payload = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        httpx.post(f"{API_BASE}/bot{token}/sendMessage", json=payload, timeout=8)
    except Exception:
        pass


def answer_callback(callback_query_id: str, text: str | None = None) -> None:
    """Подтвердить нажатие inline-кнопки (убирает «часики» у кнопки)."""
    token = bot_token()
    if not token:
        return
    payload = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        httpx.post(f"{API_BASE}/bot{token}/answerCallbackQuery", json=payload, timeout=8)
    except Exception:
        pass


def edit_message_text(chat_id: int, message_id: int, text: str, reply_markup: dict | None = None) -> None:
    """Обновить текст сообщения (например, после смены статуса задачи)."""
    token = bot_token()
    if not token:
        return
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text, "disable_web_page_preview": True}
    payload["reply_markup"] = reply_markup or {"inline_keyboard": []}
    try:
        httpx.post(f"{API_BASE}/bot{token}/editMessageText", json=payload, timeout=8)
    except Exception:
        pass


def set_webhook(url: str) -> dict:
    """Зарегистрировать вебхук в Telegram (одноразовая настройка)."""
    token = bot_token()
    if not token:
        return {"ok": False, "error": "no_token"}
    payload = {"url": url, "allowed_updates": ["message"]}
    if settings.telegram_webhook_secret:
        payload["secret_token"] = settings.telegram_webhook_secret
    try:
        r = httpx.post(f"{API_BASE}/bot{token}/setWebhook", json=payload, timeout=10)
        return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}
