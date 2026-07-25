"""Яндекс Календарь как реализация CalendarProvider.

OAuth 2.0 (oauth.yandex.ru) для получения токена + CalDAV (caldav.yandex.ru)
для операций с событиями. Яндекс.Календарь не имеет REST-API уровня Google
Calendar, поэтому события кладём как .ics-ресурсы по CalDAV (PUT/DELETE),
авторизуясь заголовком `Authorization: OAuth <token>` (схема Яндекса).

Прямое направление (OneOnOne -> Яндекс) реализовано тем же общим слоем
синхронизации (calendar_sync), что и Google — за счёт единого интерфейса.
"""
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.services.calendar_base import (
    CalendarProvider, CalendarEvent, OAuthTokens, CalendarAuthError,
)

AUTH_URL = "https://oauth.yandex.ru/authorize"
TOKEN_URL = "https://oauth.yandex.ru/token"
INFO_URL = "https://login.yandex.ru/info"
CALDAV_BASE = "https://caldav.yandex.ru/calendars"
_TIMEOUT = 15.0


def _ics_dt(dt: datetime) -> str:
    return dt.replace(microsecond=0).strftime("%Y%m%dT%H%M%SZ")


class YandexCalendarProvider(CalendarProvider):
    name = "yandex"

    def is_configured(self) -> bool:
        return bool(settings.yandex_client_id and settings.yandex_client_secret
                    and settings.yandex_redirect_uri)

    def authorize_url(self, state: str) -> str:
        params = {
            "response_type": "code",
            "client_id": settings.yandex_client_id,
            "redirect_uri": settings.yandex_redirect_uri,
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str) -> OAuthTokens:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": settings.yandex_client_id,
            "client_secret": settings.yandex_client_secret,
        }
        r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
        if r.status_code != 200:
            raise CalendarAuthError(f"yandex token exchange failed: {r.status_code}")
        t = r.json()
        return OAuthTokens(
            access_token=t.get("access_token"),
            refresh_token=t.get("refresh_token"),
            expires_at=datetime.utcnow() + timedelta(seconds=int(t.get("expires_in", 3600))),
            account_email=self._fetch_login(t.get("access_token")),
        )

    def refresh(self, refresh_token: str) -> OAuthTokens:
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.yandex_client_id,
            "client_secret": settings.yandex_client_secret,
        }
        r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
        if r.status_code != 200:
            raise CalendarAuthError(f"yandex refresh failed: {r.status_code}")
        t = r.json()
        return OAuthTokens(
            access_token=t.get("access_token"),
            refresh_token=t.get("refresh_token") or refresh_token,
            expires_at=datetime.utcnow() + timedelta(seconds=int(t.get("expires_in", 3600))),
        )

    def _fetch_login(self, access_token: str | None) -> str | None:
        if not access_token:
            return None
        try:
            r = httpx.get(INFO_URL, params={"format": "json"},
                          headers={"Authorization": f"OAuth {access_token}"}, timeout=_TIMEOUT)
            if r.status_code == 200:
                j = r.json()
                return j.get("default_email") or j.get("login")
        except Exception:
            pass
        return None

    def caldav_collection(self, login: str) -> str:
        """CalDAV-коллекция событий по умолчанию для логина."""
        return f"{CALDAV_BASE}/{login}/events-default/"

    def _ics(self, event: CalendarEvent) -> str:
        return (
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OneOnOne//RU\r\n"
            "BEGIN:VEVENT\r\n"
            f"UID:{event.uid}\r\n"
            f"DTSTAMP:{_ics_dt(datetime.utcnow())}\r\n"
            f"DTSTART:{_ics_dt(event.start)}\r\n"
            f"DTEND:{_ics_dt(event.end)}\r\n"
            f"SUMMARY:{event.summary}\r\n"
            f"DESCRIPTION:{(event.description or '').replace(chr(10), ' ')}\r\n"
            + (f"LOCATION:{event.location}\r\n" if event.location else "")
            + "END:VEVENT\r\nEND:VCALENDAR\r\n"
        )

    def _resource_url(self, calendar_id: str | None, uid: str) -> str:
        base = calendar_id or ""
        if not base:
            raise CalendarAuthError("yandex calendar collection unknown")
        if not base.endswith("/"):
            base += "/"
        return f"{base}{uid}.ics"

    def upsert_event(self, access_token, calendar_id, event, external_id):
        # external_id для CalDAV — имя ресурса (uid.ics); PUT идемпотентен.
        url = self._resource_url(calendar_id, event.uid)
        headers = {"Authorization": f"OAuth {access_token}", "Content-Type": "text/calendar; charset=utf-8"}
        r = httpx.put(url, content=self._ics(event).encode("utf-8"), headers=headers, timeout=_TIMEOUT)
        if r.status_code in (401, 403):
            raise CalendarAuthError("yandex upsert unauthorized")
        if r.status_code not in (200, 201, 204):
            raise RuntimeError(f"yandex put event failed: {r.status_code}")
        return f"{event.uid}.ics"

    def delete_event(self, access_token, calendar_id, external_id):
        uid = external_id[:-4] if external_id.endswith(".ics") else external_id
        url = self._resource_url(calendar_id, uid)
        headers = {"Authorization": f"OAuth {access_token}"}
        r = httpx.delete(url, headers=headers, timeout=_TIMEOUT)
        if r.status_code in (401, 403):
            raise CalendarAuthError("yandex delete unauthorized")
        # 404 = уже удалено — идемпотентно
