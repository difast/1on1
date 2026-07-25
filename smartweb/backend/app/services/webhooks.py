"""Исходящие вебхуки: рассылка событий системы на внешние URL команды.

Симметрично проверке входящих вебхуков CloudPayments, только в обратную сторону:
каждый POST подписывается HMAC-SHA256 по секрету подписки, подпись кладётся в
заголовок X-OneOnOne-Signature (base64). Получатель проверяет её тем же секретом.

Доставка асинхронная (отдельный поток) — не блокирует основной запрос. При
ошибке доставки делаем несколько повторов с нарастающей задержкой, затем
фиксируем неудачу в журнале (webhook_deliveries). Сбой доставки НИКОГДА не
влияет на основную операцию.
"""
import base64
import hashlib
import hmac
import json
import logging
import threading
import time
from datetime import datetime

import httpx

from app.database import SessionLocal
from app.models.integration import WebhookSubscription, WebhookDelivery

log = logging.getLogger("webhooks")

# Начальный разумный набор событий. Список легко расширяется.
EVENTS = (
    "task.created",
    "task.status_changed",
    "task.completed",
    "meeting.created",
    "meeting.completed",
    "meeting.cancelled",
)

_RETRIES = 3                 # число попыток доставки
_BACKOFF = (2, 5, 15)        # задержки между попытками, сек
_TIMEOUT = 10.0
_MAX_DELIVERIES_KEPT = 50    # сколько последних доставок хранить на подписку


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256(secret, body) в base64 — значение заголовка подписи."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def _matches(sub: WebhookSubscription, event_type: str) -> bool:
    if not sub.active:
        return False
    if not sub.events:              # пустой список = все события
        return True
    return event_type in sub.events


def _deliver(subscription_id: int, url: str, secret: str, event_type: str, payload: dict):
    """Доставить один вебхук с повторами; результат пишем в журнал. Своя сессия БД."""
    body = json.dumps({"event": event_type, "data": payload,
                       "sent_at": datetime.utcnow().isoformat() + "Z"},
                      ensure_ascii=False).encode("utf-8")
    signature = sign(secret, body)
    headers = {
        "Content-Type": "application/json",
        "X-OneOnOne-Event": event_type,
        "X-OneOnOne-Signature": signature,
    }
    db = SessionLocal()
    delivery = WebhookDelivery(subscription_id=subscription_id, event_type=event_type,
                               payload=payload, status="pending", attempts=0)
    db.add(delivery); db.commit(); db.refresh(delivery)

    last_error = None
    status_code = None
    for attempt in range(1, _RETRIES + 1):
        delivery.attempts = attempt
        try:
            r = httpx.post(url, content=body, headers=headers, timeout=_TIMEOUT)
            status_code = r.status_code
            if 200 <= r.status_code < 300:
                delivery.status = "success"; delivery.status_code = status_code
                delivery.delivered_at = datetime.utcnow(); delivery.last_error = None
                db.commit()
                _trim(db, subscription_id)
                db.close()
                return
            last_error = f"HTTP {r.status_code}"
        except Exception as e:
            last_error = type(e).__name__
        db.commit()
        if attempt < _RETRIES:
            time.sleep(_BACKOFF[min(attempt - 1, len(_BACKOFF) - 1)])

    delivery.status = "failed"; delivery.status_code = status_code
    delivery.last_error = last_error
    db.commit()
    log.warning("webhook delivery failed (sub=%s, event=%s): %s",
                subscription_id, event_type, last_error)
    _trim(db, subscription_id)
    db.close()


def _trim(db, subscription_id: int):
    """Оставляем только последние N записей журнала на подписку."""
    ids = [d.id for d in db.query(WebhookDelivery.id)
           .filter(WebhookDelivery.subscription_id == subscription_id)
           .order_by(WebhookDelivery.id.desc()).offset(_MAX_DELIVERIES_KEPT).all()]
    if ids:
        db.query(WebhookDelivery).filter(WebhookDelivery.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


def dispatch(db, team_id: int, event_type: str, data: dict) -> None:
    """Разослать событие на все активные вебхуки команды. Не блокирует запрос:
    для каждой подписки поднимаем фоновый поток доставки. Чтение подписок — по
    переданной сессии (быстро), доставка — в отдельных сессиях."""
    if team_id is None:
        return
    try:
        subs = (db.query(WebhookSubscription)
                .filter(WebhookSubscription.team_id == team_id,
                        WebhookSubscription.active == True)  # noqa: E712
                .all())
    except Exception:
        return
    for sub in subs:
        if not _matches(sub, event_type):
            continue
        try:
            threading.Thread(
                target=_deliver,
                args=(sub.id, sub.url, sub.secret, event_type, data),
                daemon=True,
            ).start()
        except Exception:
            log.warning("failed to start webhook thread (sub=%s)", sub.id)
