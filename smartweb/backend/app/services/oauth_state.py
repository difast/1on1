"""CSRF-state для OAuth-потоков (общий механизм).

Реализация вынесена сюда из routers/integrations.py без изменения формата:
base64url(payload + "." + HMAC-SHA256(payload)[:16]), где payload — JSON с
полями u (user_id), p (провайдер/поток), n (nonce), t (время выпуска).

Тем же механизмом пользуются и подключение календарей (user_id известен), и
вход через Yandex ID (user_id = 0 — пользователь ещё не авторизован, state
нужен только как защита от CSRF/подмены кода).
"""
import base64
import hashlib
import hmac
import json
import secrets
import time

from app.config import settings


def make_state(user_id: int, provider: str, platform: str | None = None) -> str:
    """platform ("mobile") записывается в payload открытым полем m.

    Это не секрет и не влияет на проверку подписи: поле нужно странице
    возврата в вебе, чтобы отличить вход, начатый из приложения, и перебросить
    результат в приложение по его схеме. Подпись по-прежнему считается по всему
    payload, поэтому подменить метку, не сломав state, нельзя."""
    data = {
        "u": user_id, "p": provider,
        "n": secrets.token_hex(8), "t": int(time.time()),
    }
    if platform:
        data["m"] = platform
    payload = json.dumps(data)
    mac = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{payload}.{mac}".encode()).decode()


def read_state(state: str, provider: str, max_age: int | None = None) -> int | None:
    """Проверить подпись state и вернуть user_id (0 — анонимный поток входа).
    None — подпись не сошлась, поток другой или state просрочен.
    max_age (сек) проверяется только если в payload есть метка времени: state,
    выпущенные до появления поля t, остаются валидными."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        payload, mac = raw.rsplit(".", 1)
        expected = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(expected, mac):
            return None
        data = json.loads(payload)
        if data.get("p") != provider:
            return None
        if max_age is not None:
            ts = data.get("t")
            if ts is not None and (time.time() - int(ts)) > max_age:
                return None
        return int(data.get("u"))
    except Exception:
        return None


def read_platform(state: str) -> str | None:
    """Метка платформы из state без проверки подписи.

    Используется только для выбора места, куда вернуть результат (веб или
    приложение). Подлинность state всё равно проверяется на обмене кода в
    read_state, поэтому подделка метки ничего не даёт: она лишь уведёт ответ
    в приложение, где обмен так же упрётся в проверку подписи."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        payload, _ = raw.rsplit(".", 1)
        return json.loads(payload).get("m") or None
    except Exception:
        return None
