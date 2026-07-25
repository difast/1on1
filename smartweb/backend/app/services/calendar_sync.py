"""Единый слой синхронизации встреч с внешними календарями.

Не знает про конкретного провайдера — работает через CalendarProvider, поэтому
Google и Яндекс обслуживаются ОДНИМ и тем же кодом (без дублирования логики).

Прямое направление (OneOnOne -> календарь):
  создание/изменение встречи  -> upsert события у каждого участника с подключённым
                                 календарём (тимлид и участник);
  отмена/отклонение встречи    -> удаление события.

Работает в фоне (отдельный поток со своей сессией БД) — не блокирует ответ API.
Ошибки провайдера не влияют на основную операцию (встреча уже сохранена).
При недействительном токене интеграция помечается status="reauth_required".
"""
import logging
import threading
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models.integration import CalendarIntegration, CalendarEventLink
from app.models.meeting import Meeting
from app.models.user import User
from app.services import crypto
from app.services.calendar_base import (
    get_calendar_provider, CalendarEvent, CalendarAuthError,
)

log = logging.getLogger("calendar_sync")

# Статусы, при которых событие должно быть УДАЛЕНО из календаря.
_CANCELLED = ("cancelled", "declined")
_DEFAULT_DURATION_MIN = 30


def _valid_access_token(db, integ: CalendarIntegration):
    """Вернуть рабочий access token, при необходимости обновив его по refresh.
    None -> интеграция требует повторного подключения (статус уже выставлен)."""
    provider = get_calendar_provider(integ.provider)
    access = crypto.decrypt(integ.access_token_enc)
    fresh_enough = integ.token_expiry and integ.token_expiry > datetime.utcnow() + timedelta(minutes=2)
    if access and fresh_enough:
        return access
    refresh = crypto.decrypt(integ.refresh_token_enc)
    if not refresh:
        # access есть, но срок неизвестен/истёк и обновить нечем — пробуем как есть.
        return access
    try:
        tokens = provider.refresh(refresh)
    except CalendarAuthError:
        integ.status = "reauth_required"
        db.commit()
        return None
    except Exception as e:
        log.warning("calendar refresh error (%s): %s", integ.provider, type(e).__name__)
        return access  # временная сетевая ошибка — попробуем текущим токеном
    integ.access_token_enc = crypto.encrypt(tokens.access_token)
    if tokens.refresh_token:
        integ.refresh_token_enc = crypto.encrypt(tokens.refresh_token)
    integ.token_expiry = tokens.expires_at
    integ.status = "connected"
    db.commit()
    return tokens.access_token


def _event_for(meeting: Meeting, other_name: str) -> CalendarEvent:
    start = meeting.scheduled_date
    end = start + timedelta(minutes=_DEFAULT_DURATION_MIN)
    return CalendarEvent(
        uid=f"oneonone-meeting-{meeting.id}",
        summary=f"1-на-1: {other_name}",
        description=(meeting.agenda or "Встреча 1-на-1 в OneOnOne"),
        start=start, end=end,
        location=meeting.jitsi_room_url or None,
    )


def _sync_one(db, integ: CalendarIntegration, meeting: Meeting, other_name: str, remove: bool):
    provider = get_calendar_provider(integ.provider)
    link = (db.query(CalendarEventLink)
            .filter(CalendarEventLink.meeting_id == meeting.id,
                    CalendarEventLink.user_id == integ.user_id,
                    CalendarEventLink.provider == integ.provider)
            .first())
    access = _valid_access_token(db, integ)
    if not access:
        return
    try:
        if remove:
            if link:
                provider.delete_event(access, integ.external_calendar_id, link.external_event_id)
                db.delete(link); db.commit()
            return
        ext = provider.upsert_event(access, integ.external_calendar_id,
                                    _event_for(meeting, other_name),
                                    link.external_event_id if link else None)
        if link:
            link.external_event_id = ext
        else:
            db.add(CalendarEventLink(meeting_id=meeting.id, user_id=integ.user_id,
                                     provider=integ.provider, external_event_id=ext))
        db.commit()
    except CalendarAuthError:
        integ.status = "reauth_required"; db.commit()
    except Exception as e:
        log.warning("calendar sync error (%s, meeting=%s): %s",
                    integ.provider, meeting.id, type(e).__name__)


def _run(meeting_id: int):
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return
        remove = meeting.status in _CANCELLED
        # Участники встречи: тимлид и участник. Синхронизируем календарь каждого,
        # у кого он подключён; в событии показываем имя ДРУГОЙ стороны.
        lead = db.query(User).filter(User.id == meeting.team_lead_id).first()
        member = db.query(User).filter(User.id == meeting.member_id).first()
        for uid, other in ((meeting.team_lead_id, member.name if member else "участник"),
                           (meeting.member_id, lead.name if lead else "тимлид")):
            integs = (db.query(CalendarIntegration)
                      .filter(CalendarIntegration.user_id == uid,
                              CalendarIntegration.status == "connected")
                      .all())
            for integ in integs:
                _sync_one(db, integ, meeting, other, remove)
    except Exception as e:
        log.warning("calendar sync run failed (meeting=%s): %s", meeting_id, type(e).__name__)
    finally:
        db.close()


def sync_meeting_async(meeting_id: int) -> None:
    """Запустить синхронизацию встречи в фоне (не блокирует запрос)."""
    try:
        threading.Thread(target=_run, args=(meeting_id,), daemon=True).start()
    except Exception:
        # Если поток не удалось создать — тихо пропускаем, встреча уже сохранена.
        log.warning("failed to start calendar sync thread for meeting %s", meeting_id)
