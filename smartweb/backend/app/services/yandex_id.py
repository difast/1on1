"""Yandex ID как способ входа/регистрации (НЕ календарь).

Переиспользует ту же OAuth-инфраструктуру Яндекса, что и календарная
интеграция (oauth.yandex.ru/authorize -> /token -> login.yandex.ru/info), но:
  * другой набор скоупов: login:email login:info login:avatar
    (у календаря — calendar:all/CalDAV, к профилю отношения не имеет);
  * другой redirect URI: /auth/yandex/callback на вебе и deep-link
    oneonone://auth/yandex/callback в приложении.

Из ответа login.yandex.ru/info берём: id (стабильный идентификатор провайдера),
default_email, login, first_name/last_name, sex, аватар. Пол и логин — только
служебные данные, в модель User не сохраняются (поля для пола нет и не заводим).
"""
import logging
from urllib.parse import urlencode

import httpx

from app.config import settings

AUTH_URL = "https://oauth.yandex.ru/authorize"
TOKEN_URL = "https://oauth.yandex.ru/token"
INFO_URL = "https://login.yandex.ru/info"
AVATAR_URL = "https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"

# Скоупы входа. Соответствуют выданным правам: адрес почты, логин/имя/фамилия/пол,
# портрет. Календарного скоупа здесь нет — потоки независимы.
LOGIN_SCOPES = "login:email login:info login:avatar"

_TIMEOUT = 15.0
log = logging.getLogger("yandex_id")


class YandexAuthError(Exception):
    """Ошибка OAuth-обмена или запроса профиля у Yandex ID."""


def is_configured() -> bool:
    return bool(settings.yandex_login_id and settings.yandex_login_secret)


def redirect_uri(platform: str = "web") -> str:
    """Redirect URI потока входа — ОДИН И ТОТ ЖЕ для веба и приложения.

    В панели Yandex OAuth у приложения можно указать только один адрес
    возврата, и нестандартные схемы вида oneonone:// она не принимает. Поэтому
    оба потока возвращаются на веб-адрес, а страница возврата, увидев в state
    метку мобильного входа, перебрасывает результат в приложение по его схеме.
    Для Яндекса это обычный веб-поток, менять в панели ничего не нужно.

    platform остаётся в сигнатуре: он влияет на метку в state, а не на адрес."""
    return settings.yandex_login_web_redirect


def app_redirect_uri() -> str:
    """Схема приложения, куда веб-страница возврата перебрасывает результат."""
    return settings.yandex_login_mobile_redirect_uri or ""


def authorize_url(state: str, platform: str = "web") -> str:
    """URL страницы согласия Yandex ID."""
    params = {
        "response_type": "code",
        "client_id": settings.yandex_login_id,
        "scope": LOGIN_SCOPES,
        "state": state,
        # force_confirm не ставим: повторный вход проходит без лишнего экрана.
    }
    ru = redirect_uri(platform)
    if ru:
        params["redirect_uri"] = ru
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Обменять code на access_token. Возвращает разобранный ответ Яндекса
    (access_token, scope и т.д.). redirect_uri в обмене Яндекс не требует —
    как и в календарной интеграции, не передаём."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.yandex_login_id,
        "client_secret": settings.yandex_login_secret,
    }
    r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
    if r.status_code != 200:
        log.warning("yandex id token exchange failed: %s", r.status_code)
        raise YandexAuthError("token_exchange_failed")
    t = r.json()
    if not t.get("access_token"):
        raise YandexAuthError("no_access_token")
    return t


def fetch_profile(access_token: str) -> dict:
    """Данные пользователя из login.yandex.ru/info (схема авторизации Яндекса:
    заголовок `Authorization: OAuth <token>`)."""
    r = httpx.get(INFO_URL, params={"format": "json"},
                  headers={"Authorization": f"OAuth {access_token}"}, timeout=_TIMEOUT)
    if r.status_code != 200:
        log.warning("yandex id info failed: %s", r.status_code)
        raise YandexAuthError("info_failed")
    return r.json() or {}


def avatar_url(info: dict) -> str | None:
    """Портрет пользователя. is_avatar_empty=true — аватара нет, ставить
    заглушку Яндекса не нужно."""
    if info.get("is_avatar_empty"):
        return None
    avatar_id = info.get("default_avatar_id")
    if not avatar_id:
        return None
    return AVATAR_URL.format(avatar_id=avatar_id)


def display_name(info: dict) -> str | None:
    """Имя для профиля: «Имя Фамилия», иначе display_name/real_name/логин."""
    first = (info.get("first_name") or "").strip()
    last = (info.get("last_name") or "").strip()
    full = " ".join(p for p in (first, last) if p).strip()
    if full:
        return full[:255]
    for key in ("display_name", "real_name", "login"):
        v = (info.get(key) or "").strip()
        if v:
            return v[:255]
    return None


def verified_email(info: dict, granted_scopes: str | None) -> str | None:
    """Email, которому можно доверять.

    Отдельного флага «email подтверждён» Yandex ID не возвращает: подтверждением
    служит сам факт выдачи скоупа login:email — default_email принадлежит
    аккаунту и проверен провайдером. Если скоуп не выдан (пользователь снял
    галочку) — email не берём вообще, а не берём «на честном слове».
    """
    scopes = (granted_scopes or "").split()
    if scopes and "login:email" not in scopes:
        return None
    email = (info.get("default_email") or "").strip().lower()
    if not email:
        emails = info.get("emails") or []
        email = (emails[0] if emails else "").strip().lower()
    return email or None


def profile_from_token(access_token: str, granted_scopes: str | None) -> dict:
    """Нормализованный профиль Yandex ID для логики входа.

    Пол (sex) и логин (login) возвращаются как служебные данные — они НЕ
    сохраняются в модель User (поля для пола нет и не добавляется).
    """
    info = fetch_profile(access_token)
    yandex_id = str(info.get("id") or "").strip()
    if not yandex_id:
        raise YandexAuthError("no_provider_id")
    return {
        "yandex_id": yandex_id,
        "email": verified_email(info, granted_scopes),
        "name": display_name(info),
        "avatar": avatar_url(info),
        "login": info.get("login"),
        "sex": info.get("sex"),
    }
