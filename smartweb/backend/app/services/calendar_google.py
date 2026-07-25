"""Google Calendar как реализация CalendarProvider.

OAuth 2.0 (offline access -> refresh token) + Google Calendar API v3.
Прямое направление (OneOnOne -> Google) реализовано полностью: события
создаются/обновляются/удаляются в основном календаре пользователя ("primary").

Расширяет прежний ручной экспорт (ссылка calendar.google.com/render из карточки
встречи) до автоматической серверной синхронизации через API.
"""
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.services.calendar_base import (
    CalendarProvider, CalendarEvent, OAuthTokens, CalendarAuthError,
)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar.events"
_TIMEOUT = 15.0


class GoogleCalendarProvider(CalendarProvider):
    name = "google"

    def is_configured(self) -> bool:
        return bool(settings.google_client_id and settings.google_client_secret
                    and settings.google_redirect_uri)

    def authorize_url(self, state: str) -> str:
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",       # чтобы пришёл refresh_token
            "prompt": "consent",            # гарантируем refresh_token при повторном подключении
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str) -> OAuthTokens:
        data = {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        }
        r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
        if r.status_code != 200:
            raise CalendarAuthError(f"google token exchange failed: {r.status_code}")
        t = r.json()
        return OAuthTokens(
            access_token=t.get("access_token"),
            refresh_token=t.get("refresh_token"),
            expires_at=datetime.utcnow() + timedelta(seconds=int(t.get("expires_in", 3600))),
            account_email=self._fetch_email(t.get("access_token")),
        )

    def refresh(self, refresh_token: str) -> OAuthTokens:
        data = {
            "refresh_token": refresh_token,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "grant_type": "refresh_token",
        }
        r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
        if r.status_code != 200:
            # 400 invalid_grant = refresh token отозван/протух -> нужен повтор OAuth
            raise CalendarAuthError(f"google refresh failed: {r.status_code}")
        t = r.json()
        return OAuthTokens(
            access_token=t.get("access_token"),
            refresh_token=refresh_token,   # Google повторно refresh не присылает
            expires_at=datetime.utcnow() + timedelta(seconds=int(t.get("expires_in", 3600))),
        )

    def _fetch_email(self, access_token: str | None) -> str | None:
        if not access_token:
            return None
        try:
            r = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
                          headers={"Authorization": f"Bearer {access_token}"}, timeout=_TIMEOUT)
            if r.status_code == 200:
                return r.json().get("email")
        except Exception:
            pass
        return None

    def _event_body(self, event: CalendarEvent) -> dict:
        return {
            "summary": event.summary,
            "description": event.description,
            "location": event.location,
            "start": {"dateTime": event.start.replace(microsecond=0).isoformat() + "Z"},
            "end": {"dateTime": event.end.replace(microsecond=0).isoformat() + "Z"},
            # extendedProperties связывает событие с нашей встречей (для обратной сверки)
            "extendedProperties": {"private": {"oneonone_uid": event.uid}},
        }

    def upsert_event(self, access_token, calendar_id, event, external_id):
        cal = calendar_id or "primary"
        headers = {"Authorization": f"Bearer {access_token}"}
        body = self._event_body(event)
        if external_id:
            r = httpx.patch(f"{API_BASE}/calendars/{cal}/events/{external_id}",
                            json=body, headers=headers, timeout=_TIMEOUT)
            if r.status_code == 200:
                return external_id
            if r.status_code in (404, 410):
                external_id = None  # событие удалили на стороне Google -> создаём заново
            elif r.status_code in (401, 403):
                raise CalendarAuthError("google upsert unauthorized")
        r = httpx.post(f"{API_BASE}/calendars/{cal}/events", json=body,
                       headers=headers, timeout=_TIMEOUT)
        if r.status_code in (401, 403):
            raise CalendarAuthError("google create unauthorized")
        if r.status_code not in (200, 201):
            raise RuntimeError(f"google create event failed: {r.status_code}")
        return r.json().get("id")

    def delete_event(self, access_token, calendar_id, external_id):
        cal = calendar_id or "primary"
        headers = {"Authorization": f"Bearer {access_token}"}
        r = httpx.delete(f"{API_BASE}/calendars/{cal}/events/{external_id}",
                         headers=headers, timeout=_TIMEOUT)
        if r.status_code in (401, 403):
            raise CalendarAuthError("google delete unauthorized")
        # 404/410 = уже удалено; считаем успехом (идемпотентность)
