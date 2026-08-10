"""VK ID как способ входа/регистрации.

Поток (калька с Yandex ID, отличия — в специфике VK ID SDK / OAuth 2.1):
  * фронтенд рендерит официальный виджет VK ID SDK (One Tap + QR). Виджет сам
    проводит авторизацию (PKCE на клиенте) и отдаёт одноразовый `code` и
    `device_id` в событии LOGIN_SUCCESS;
  * ОБМЕН кода на токен делаем ЗДЕСЬ, на бэкенде: приложение VK ID —
    конфиденциальный клиент, аутентифицируется своим `client_secret`, который
    никогда не попадает в браузер;
  * профиль берём в первую очередь из OpenID Connect `id_token` (VK ID отдаёт
    его прямо в ответе обмена — это JWT с claims sub/first_name/last_name/email/
    avatar), а user_info дергаем лишь как запасной источник. Так вход не падает,
    если отдельный вызов user_info по какой-то причине недоступен.

CSRF: отдельный `state`, как у Yandex ID, здесь НЕ нужен — VK ID SDK
использует встроенный PKCE (code_challenge/code_verifier) и свой state внутри
SDK. Дублировать защиту не требуется (см. Этап 1 задачи).
"""
import base64
import json
import logging

import httpx

from app.config import settings

# VK ID OAuth 2.1. Хост берём из настроек (id.vk.ru по умолчанию — как у SDK;
# при необходимости переключается на id.vk.com одной переменной VK_ID_DOMAIN),
# чтобы виджет и серверный обмен кода всегда были на одном домене.
def _token_url() -> str:
    return f"https://{settings.vk_id_host}/oauth2/auth"


def _user_info_url() -> str:
    return f"https://{settings.vk_id_host}/oauth2/user_info"

# Запрашиваемые данные: email + имя/фамилия/фото. Имя/фамилия/аватар VK ID
# отдаёт по базовому доступу (в id_token / user_info), отдельного скоупа не
# требуют; отдельно запрашиваем email. Скоуп уходит в SDK на фронте.
LOGIN_SCOPES = "email"

_TIMEOUT = 15.0
log = logging.getLogger("vk_id")


class VkAuthError(Exception):
    """Ошибка OAuth-обмена или запроса профиля у VK ID."""


def is_configured() -> bool:
    return bool(settings.vk_app_id and settings.vk_client_secret)


def _decode_jwt_payload(token: str) -> dict:
    """Достать claims из JWT (id_token) без проверки подписи.

    Токен получен прямо в ответе обмена по TLS от id.vk.com в ответ на наш
    аутентифицированный по client_secret запрос, поэтому источнику доверяем;
    подпись отдельно не проверяем (для этого нужен JWKS VK)."""
    try:
        parts = (token or "").split(".")
        if len(parts) < 2:
            return {}
        seg = parts[1]
        seg += "=" * (-len(seg) % 4)  # восстановить padding base64url
        return json.loads(base64.urlsafe_b64decode(seg.encode()).decode("utf-8")) or {}
    except Exception:
        return {}


def exchange_code(code: str, device_id: str, code_verifier: str | None = None,
                  state: str | None = None) -> dict:
    """Обменять одноразовый `code` (+ `device_id`) на токены НА БЭКЕНДЕ.

    Разные приложения VK ID принимают РАЗНЫЙ набор параметров обмена: одни как
    конфиденциальный клиент (аутентификация по client_secret), другие требуют
    строгий PKCE (code_verifier). Плюс часть приложений хочет redirect_uri в
    обмене, часть — нет. Точную комбинацию снаружи не угадать, поэтому пробуем
    по очереди, пока VK не отдаст access_token. Неуспешный обмен (4xx) код не
    расходует, поэтому попытки безопасны. Тело каждой ошибки логируем — по нему
    видно реальную причину (invalid_grant, redirect_uri_mismatch,
    code_verifier required и т.п.)."""
    base = {
        "grant_type": "authorization_code",
        "code": code,
        "device_id": device_id,
        "client_id": settings.vk_app_id,
    }
    if state:
        base["state"] = state

    secret = settings.vk_client_secret
    ru = settings.vk_login_web_redirect

    def variant(**extra):
        d = dict(base)
        d.update({k: v for k, v in extra.items() if v})
        return d

    # Порядок: конфиденциальный клиент (с redirect_uri и без) → строгий PKCE.
    attempts = []
    if secret:
        attempts.append(variant(client_secret=secret, redirect_uri=ru, code_verifier=code_verifier))
        attempts.append(variant(client_secret=secret, code_verifier=code_verifier))
    if code_verifier:
        attempts.append(variant(code_verifier=code_verifier, redirect_uri=ru))
        attempts.append(variant(code_verifier=code_verifier))
    if ru:
        attempts.append(variant(redirect_uri=ru))

    # Убираем дубли, сохраняя порядок.
    seen, uniq = set(), []
    for d in attempts:
        key = tuple(sorted((k, v) for k, v in d.items() if k != "code"))
        if key not in seen:
            seen.add(key); uniq.append(d)

    last = "no_attempts"
    for i, data in enumerate(uniq):
        try:
            r = httpx.post(_token_url(), data=data, timeout=_TIMEOUT)
        except Exception as e:
            last = f"request_error {type(e).__name__}"
            log.warning("vk id exchange attempt %s: %s", i, last)
            continue
        if r.status_code == 200:
            t = r.json() or {}
            if t.get("access_token"):
                return t
            last = f"no_access_token body={json.dumps(t)[:300]}"
        else:
            last = f"HTTP {r.status_code} body={(r.text or '')[:300]}"
        log.warning("vk id exchange attempt %s (params=%s): %s",
                    i, sorted(k for k in data if k not in ('code', 'client_secret')), last)
    raise VkAuthError(f"token_exchange_failed: {last}")


def fetch_user_info(access_token: str) -> dict:
    """Данные пользователя из VK ID user_info. Запасной источник к id_token:
    ошибку НЕ пробрасываем как фатальную — вызывающий сам решит, хватило ли
    данных из id_token."""
    try:
        r = httpx.post(_user_info_url(), data={
            "client_id": settings.vk_app_id,
            "access_token": access_token,
        }, timeout=_TIMEOUT)
    except Exception as e:
        log.warning("vk id user_info request error: %s", type(e).__name__)
        return {}
    if r.status_code != 200:
        log.warning("vk id user_info failed: HTTP %s body=%s",
                    r.status_code, (r.text or "")[:500])
        return {}
    body = r.json() or {}
    # VK ID кладёт данные в объект user; поддержим и плоский ответ.
    return body.get("user") or body


def profile_from_auth(tokens: dict, info: dict | None = None) -> dict:
    """Нормализованный профиль VK ID: id_token (OIDC) + user_info + поля обмена.

    Порядок источников: user_info -> claims из id_token -> сам ответ обмена.
    Email выдаётся только при согласии на скоуп email и является адресом
    аккаунта VK (подтверждён провайдером). Пол/телефон — служебные, не пишем.
    """
    info = info or {}
    claims = _decode_jwt_payload(tokens.get("id_token") or "")

    def pick(*keys):
        for src in (info, claims, tokens):
            for k in keys:
                v = src.get(k)
                if v not in (None, ""):
                    return v
        return None

    vk_id = str(pick("user_id", "sub") or "").strip()
    if not vk_id:
        log.warning("vk id: no provider id; info_keys=%s claims_keys=%s token_keys=%s",
                    list(info.keys()), list(claims.keys()), list(tokens.keys()))
        raise VkAuthError("no_provider_id")

    email = (pick("email") or "").strip().lower() or None
    avatar = (pick("avatar", "photo_200", "photo") or "").strip() or None
    first = (pick("first_name") or "").strip()
    last = (pick("last_name") or "").strip()
    name = " ".join(p for p in (first, last) if p).strip()
    if not name:
        name = (pick("screen_name", "name") or "").strip() or None

    return {
        "vk_id": vk_id,
        "email": email,
        "name": name[:255] if name else None,
        "avatar": avatar,
    }
