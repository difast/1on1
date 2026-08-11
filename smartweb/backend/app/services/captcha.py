"""Проверка Yandex SmartCaptcha на сервере (Блок 1, Этап 2).

Клиент показывает виджет (client_key) и получает одноразовый токен, который
присылает на защищаемый эндпоинт. Здесь токен проверяется server-to-server по
секретному server_key. Ключи — только из окружения.

SmartCaptcha сама адаптивно определяет сложность (простой чекбокс для обычного
поведения, задание — при подозрительном), поэтому на сервере отдельного
переключения «простая/сложная» не требуется: используется единый виджет, а
Яндекс решает уровень по поведенческому анализу.
"""
import logging

import httpx

from app.config import settings

log = logging.getLogger("captcha")

_VALIDATE_URL = "https://smartcaptcha.yandexcloud.net/validate"


def configured() -> bool:
    return bool(settings.captcha_server_key)


def verify(token: str | None, ip: str | None = None) -> bool:
    """True, если токен капчи валиден. Поведение:

    - если server_key не задан — проверка пропускается (True): dev/без ключа;
    - если токен пуст — False (когда включён captcha_enforce, вызывающий отклонит);
    - сетевой сбой сервиса капчи НЕ блокирует вход (fail-open): капча — один из
      нескольких слоёв (ещё есть rate limit), и недоступность Яндекса не должна
      оставить пользователей без входа.
    """
    if not settings.captcha_server_key:
        return True
    if not token:
        return False
    try:
        params = {"secret": settings.captcha_server_key, "token": token}
        if ip:
            params["ip"] = ip
        r = httpx.get(_VALIDATE_URL, params=params, timeout=5)
        if r.status_code != 200:
            log.warning("smartcaptcha validate http %s", r.status_code)
            return True  # fail-open при сбое сервиса
        return (r.json() or {}).get("status") == "ok"
    except Exception as e:
        log.warning("smartcaptcha validate error: %s", type(e).__name__)
        return True  # fail-open


def ensure(token: str | None, ip: str | None = None) -> None:
    """Проверить капчу с учётом флага обязательности. Бросает 400 при провале.

    При captcha_enforce=0 отсутствие токена допускается (мягкий раскат), но
    ПРИСЛАННЫЙ токен всё равно проверяется. При captcha_enforce=1 токен обязателен.
    """
    from fastapi import HTTPException
    if not configured():
        return
    if not token:
        if settings.captcha_enforce:
            raise HTTPException(status_code=400, detail="Подтвердите, что вы не робот")
        return
    if not verify(token, ip):
        raise HTTPException(status_code=400, detail="Проверка капчи не пройдена. Попробуйте ещё раз")
