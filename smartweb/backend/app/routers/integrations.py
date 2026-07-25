"""Интеграции: OAuth-подключение календарей и управление исходящими вебхуками.

Календарные токены сохраняются только в зашифрованном виде (crypto.py) и никогда
не возвращаются клиенту и не пишутся в логи. Синхронизация встреч работает через
общий слой calendar_sync (Google и Яндекс — две реализации одного интерфейса).
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.integration import (
    CalendarIntegration, WebhookSubscription, WebhookDelivery,
)
from app.models.team import Team
from app.utils.auth import get_current_user
from app.services import crypto
from app.services.calendar_base import get_calendar_provider, SUPPORTED_PROVIDERS, CalendarAuthError
from app.services import webhooks as webhook_service

router = APIRouter()
log = logging.getLogger("integrations")

# Провайдеры для блока «Скоро» — честно, без сроков.
COMING_SOON = [
    {"key": "bitrix24", "name": "Bitrix24"},
    {"key": "slack", "name": "Slack"},
    {"key": "teams", "name": "Microsoft Teams"},
]


# ── OAuth state (защита от CSRF, привязка к пользователю) ──────────────────────

def _make_state(user_id: int, provider: str) -> str:
    payload = json.dumps({"u": user_id, "p": provider, "n": secrets.token_hex(8)})
    mac = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{payload}.{mac}".encode()).decode()


def _read_state(state: str, provider: str) -> int | None:
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        payload, mac = raw.rsplit(".", 1)
        expected = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(expected, mac):
            return None
        data = json.loads(payload)
        if data.get("p") != provider:
            return None
        return int(data.get("u"))
    except Exception:
        return None


def _calendar_status(db: Session, user_id: int) -> list[dict]:
    out = []
    rows = {i.provider: i for i in db.query(CalendarIntegration)
            .filter(CalendarIntegration.user_id == user_id).all()}
    for prov in SUPPORTED_PROVIDERS:
        provider = get_calendar_provider(prov)
        integ = rows.get(prov)
        out.append({
            "provider": prov,
            "configured": provider.is_configured(),
            "connected": bool(integ and integ.status == "connected"),
            "status": integ.status if integ else "not_connected",
            "account_email": integ.account_email if integ else None,
        })
    return out


# ── статус вкладки «Интеграции» ────────────────────────────────────────────────

@router.get("/status")
def status(user_id: int = Query(...), team_id: int | None = Query(None),
           db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Состояние всех интеграций пользователя/команды для отрисовки вкладки."""
    webhooks = []
    if team_id is not None:
        for sub in (db.query(WebhookSubscription)
                    .filter(WebhookSubscription.team_id == team_id)
                    .order_by(WebhookSubscription.id.desc()).all()):
            webhooks.append(_webhook_dict(db, sub))
    return {
        "calendars": _calendar_status(db, user_id),
        "webhooks": webhooks,
        "webhook_events": list(webhook_service.EVENTS),
        "coming_soon": COMING_SOON,
    }


# ── OAuth: старт ───────────────────────────────────────────────────────────────

@router.get("/{provider}/authorize")
def authorize(provider: str, user_id: int = Query(...),
              db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Вернуть URL страницы согласия OAuth. Клиент делает по нему переход."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(404, "Неизвестный провайдер")
    cp = get_calendar_provider(provider)
    if not cp.is_configured():
        raise HTTPException(status_code=400, detail={
            "code": "provider_not_configured",
            "message": "Интеграция ещё не настроена администратором.",
        })
    return {"url": cp.authorize_url(_make_state(user_id, provider))}


class CallbackReq(BaseModel):
    code: str
    state: str


@router.post("/{provider}/callback")
def callback(provider: str, data: CallbackReq, db: Session = Depends(get_db)):
    """Завершить OAuth: обменять code на токены и сохранить подключение.
    user_id берётся из подписанного state (не с клиента) — защита от CSRF."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(404, "Неизвестный провайдер")
    user_id = _read_state(data.state, provider)
    if user_id is None:
        raise HTTPException(400, "Недействительный state")
    cp = get_calendar_provider(provider)
    try:
        tokens = cp.exchange_code(data.code)
    except CalendarAuthError:
        raise HTTPException(400, "Не удалось подключить календарь. Попробуйте ещё раз.")
    except Exception as e:
        log.warning("oauth exchange error (%s): %s", provider, type(e).__name__)
        raise HTTPException(502, "Сервис календаря недоступен. Попробуйте позже.")

    # Целевой календарь: у Google — primary; у Яндекса — CalDAV-коллекция по логину.
    external_cal = None
    if provider == "yandex" and tokens.account_email:
        external_cal = cp.caldav_collection(tokens.account_email)

    integ = (db.query(CalendarIntegration)
             .filter(CalendarIntegration.user_id == user_id,
                     CalendarIntegration.provider == provider).first())
    if not integ:
        integ = CalendarIntegration(user_id=user_id, provider=provider)
        db.add(integ)
    integ.access_token_enc = crypto.encrypt(tokens.access_token)
    if tokens.refresh_token:
        integ.refresh_token_enc = crypto.encrypt(tokens.refresh_token)
    integ.token_expiry = tokens.expires_at
    integ.account_email = tokens.account_email
    integ.external_calendar_id = external_cal
    integ.status = "connected"
    db.commit()
    return {"ok": True, "provider": provider, "account_email": tokens.account_email}


@router.post("/{provider}/disconnect")
def disconnect(provider: str, user_id: int = Query(...),
               db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Отключить календарь: удалить сохранённые токены."""
    integ = (db.query(CalendarIntegration)
             .filter(CalendarIntegration.user_id == user_id,
                     CalendarIntegration.provider == provider).first())
    if integ:
        db.delete(integ)
        db.commit()
    return {"ok": True}


# ── Вебхуки ────────────────────────────────────────────────────────────────────

def _webhook_dict(db: Session, sub: WebhookSubscription) -> dict:
    recent = (db.query(WebhookDelivery)
              .filter(WebhookDelivery.subscription_id == sub.id)
              .order_by(WebhookDelivery.id.desc()).limit(10).all())
    return {
        "id": sub.id,
        "url": sub.url,
        "active": sub.active,
        "events": sub.events or [],
        "secret": sub.secret,   # нужен получателю для проверки подписи; виден только тимлиду
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "recent_deliveries": [{
            "id": d.id, "event_type": d.event_type, "status": d.status,
            "status_code": d.status_code, "attempts": d.attempts,
            "last_error": d.last_error,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        } for d in recent],
    }


def _require_team_lead(db: Session, team_id: int, user_id: int) -> Team:
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Команда не найдена")
    if team.team_lead_id != user_id:
        raise HTTPException(403, "Управлять Webhook может только тимлид команды")
    return team


class WebhookCreateReq(BaseModel):
    team_id: int
    user_id: int
    url: str
    events: list[str] | None = None


@router.post("/webhooks")
def create_webhook(data: WebhookCreateReq, db: Session = Depends(get_db),
                   current=Depends(get_current_user)):
    """Добавить исходящий вебхук (только тимлид команды). Секрет генерируется."""
    _require_team_lead(db, data.team_id, data.user_id)
    if not (data.url.startswith("http://") or data.url.startswith("https://")):
        raise HTTPException(422, "URL должен начинаться с http:// или https://")
    valid = [e for e in (data.events or []) if e in webhook_service.EVENTS]
    sub = WebhookSubscription(
        team_id=data.team_id, created_by=data.user_id, url=data.url.strip(),
        secret=secrets.token_hex(24), events=valid or None, active=True,
    )
    db.add(sub); db.commit(); db.refresh(sub)
    return _webhook_dict(db, sub)


@router.get("/webhooks")
def list_webhooks(team_id: int = Query(...), db: Session = Depends(get_db),
                  current=Depends(get_current_user)):
    subs = (db.query(WebhookSubscription)
            .filter(WebhookSubscription.team_id == team_id)
            .order_by(WebhookSubscription.id.desc()).all())
    return [_webhook_dict(db, s) for s in subs]


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: int, user_id: int = Query(...),
                   db: Session = Depends(get_db), current=Depends(get_current_user)):
    sub = db.query(WebhookSubscription).filter(WebhookSubscription.id == webhook_id).first()
    if not sub:
        return {"ok": True}
    _require_team_lead(db, sub.team_id, user_id)
    db.delete(sub); db.commit()
    return {"ok": True}


@router.post("/webhooks/{webhook_id}/test")
def test_webhook(webhook_id: int, user_id: int = Query(...),
                 db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Отправить тестовое событие, чтобы получатель проверил приём и подпись."""
    sub = db.query(WebhookSubscription).filter(WebhookSubscription.id == webhook_id).first()
    if not sub:
        raise HTTPException(404, "Webhook не найден")
    _require_team_lead(db, sub.team_id, user_id)
    webhook_service.dispatch(db, sub.team_id, "webhook.test",
                             {"message": "Тестовое событие OneOnOne", "team_id": sub.team_id})
    return {"ok": True}


@router.get("/webhooks/{webhook_id}/deliveries")
def webhook_deliveries(webhook_id: int, db: Session = Depends(get_db),
                       current=Depends(get_current_user)):
    rows = (db.query(WebhookDelivery)
            .filter(WebhookDelivery.subscription_id == webhook_id)
            .order_by(WebhookDelivery.id.desc()).limit(50).all())
    return [{
        "id": d.id, "event_type": d.event_type, "status": d.status,
        "status_code": d.status_code, "attempts": d.attempts, "last_error": d.last_error,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
    } for d in rows]
