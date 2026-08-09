"""VK ID как способ входа/регистрации.

Поток (калька с Yandex ID, отличия — в специфике VK ID SDK / OAuth 2.1):
  * фронтенд рендерит официальный виджет VK ID SDK (One Tap + QR). Виджет сам
    проводит авторизацию (PKCE на клиенте) и отдаёт одноразовый `code` и
    `device_id` в событии LOGIN_SUCCESS;
  * ОБМЕН кода на токен делаем ЗДЕСЬ, на бэкенде: приложение VK ID —
    конфиденциальный клиент, аутентифицируется своим `client_secret`, который
    никогда не попадает в браузер;
  * из ответа обмена и из user_info берём стабильный идентификатор (user_id →
    vk_id), email (если выдан и подтверждён провайдером), имя/фамилию и аватар.

CSRF: отдельный `state`, как у Yandex ID, здесь НЕ нужен — VK ID SDK
использует встроенный PKCE (code_challenge/code_verifier) и свой state внутри
SDK. Дублировать защиту не требуется (см. Этап 1 задачи).
"""
import logging

import httpx

from app.config import settings

# VK ID OAuth 2.1 (id.vk.com). Обмен кода и профиль — на этих адресах.
TOKEN_URL = "https://id.vk.com/oauth2/auth"
USER_INFO_URL = "https://id.vk.com/oauth2/user_info"

# Запрашиваемые данные: email + имя/фамилия/фото (аналог набора Yandex ID).
# В VK ID имя/фамилия/аватар отдаются в user_info по базовому доступу, отдельного
# скоупа не требуют; отдельно запрашиваем email. Скоуп уходит в SDK на фронте.
LOGIN_SCOPES = "email"

_TIMEOUT = 15.0
log = logging.getLogger("vk_id")


class VkAuthError(Exception):
    """Ошибка OAuth-обмена или запроса профиля у VK ID."""


def is_configured() -> bool:
    return bool(settings.vk_app_id and settings.vk_client_secret)


def exchange_code(code: str, device_id: str, code_verifier: str | None = None,
                  state: str | None = None) -> dict:
    """Обменять одноразовый `code` (+ `device_id`) на access_token НА БЭКЕНДЕ.

    Приложение — конфиденциальный клиент: аутентификация по client_secret,
    поэтому PKCE code_verifier на этой стороне не обязателен. Если SDK всё же
    передал code_verifier — прокидываем его, хуже не будет.
    """
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "device_id": device_id,
        "client_id": settings.vk_app_id,
        "client_secret": settings.vk_client_secret,
        "redirect_uri": settings.vk_login_web_redirect,
    }
    if code_verifier:
        data["code_verifier"] = code_verifier
    if state:
        data["state"] = state
    r = httpx.post(TOKEN_URL, data=data, timeout=_TIMEOUT)
    if r.status_code != 200:
        log.warning("vk id token exchange failed: %s", r.status_code)
        raise VkAuthError("token_exchange_failed")
    t = r.json() or {}
    if not t.get("access_token"):
        raise VkAuthError("no_access_token")
    return t


def fetch_user_info(access_token: str) -> dict:
    """Данные пользователя из VK ID user_info (user_id, имя, фамилия, аватар,
    email/phone при наличии доступа)."""
    r = httpx.post(USER_INFO_URL, data={
        "client_id": settings.vk_app_id,
        "access_token": access_token,
    }, timeout=_TIMEOUT)
    if r.status_code != 200:
        log.warning("vk id user_info failed: %s", r.status_code)
        raise VkAuthError("user_info_failed")
    body = r.json() or {}
    # VK ID кладёт данные в объект user; на всякий случай поддержим и плоский ответ.
    return body.get("user") or body


def display_name(info: dict) -> str | None:
    """Имя для профиля: «Имя Фамилия», иначе first_name/screen_name."""
    first = (info.get("first_name") or "").strip()
    last = (info.get("last_name") or "").strip()
    full = " ".join(p for p in (first, last) if p).strip()
    if full:
        return full[:255]
    for key in ("screen_name", "first_name"):
        v = (info.get(key) or "").strip()
        if v:
            return v[:255]
    return None


def profile_from_auth(tokens: dict, info: dict) -> dict:
    """Нормализованный профиль VK ID для логики входа.

    Email берём и из ответа обмена, и из user_info — что придёт. Он выдаётся
    только при согласии на скоуп email и является адресом аккаунта VK, то есть
    подтверждён провайдером. Пол/телефон — служебные, в модель User не пишем.
    """
    vk_id = str(info.get("user_id") or tokens.get("user_id") or "").strip()
    if not vk_id:
        raise VkAuthError("no_provider_id")
    email = (info.get("email") or tokens.get("email") or "").strip().lower() or None
    avatar = (info.get("avatar") or "").strip() or None
    return {
        "vk_id": vk_id,
        "email": email,
        "name": display_name(info),
        "avatar": avatar,
    }
