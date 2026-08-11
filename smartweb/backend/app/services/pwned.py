"""Проверка пароля по базе утечек HaveIBeenPwned (Блок 1, Этап 2).

Используется k-anonymity: наружу уходят ТОЛЬКО первые 5 символов SHA-1 хэша
пароля, сам пароль (и полный хэш) не передаётся. HIBP возвращает список
суффиксов с числом появлений; сверяем локально.

Поведение управляется флагом pwned_block:
  - по умолчанию (False) — предупреждение (возвращаем факт утечки, не блокируем);
  - True — вызывающий может отклонить регистрацию/смену пароля.
Сетевой сбой НИКОГДА не блокирует (fail-open): недоступность внешнего сервиса не
должна ломать регистрацию/смену пароля.
"""
import hashlib
import logging

import httpx

log = logging.getLogger("pwned")

_RANGE_URL = "https://api.pwnedpasswords.com/range/"


def breach_count(password: str) -> int:
    """Сколько раз пароль встречался в утечках. 0 — не найден или сервис недоступен."""
    if not password:
        return 0
    try:
        digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = digest[:5], digest[5:]
        r = httpx.get(_RANGE_URL + prefix, timeout=5,
                      headers={"Add-Padding": "true"})
        if r.status_code != 200:
            return 0
        for line in r.text.splitlines():
            parts = line.strip().split(":")
            if len(parts) == 2 and parts[0].upper() == suffix:
                try:
                    return int(parts[1])
                except ValueError:
                    return 1
        return 0
    except Exception as e:
        log.info("pwned check unavailable: %s", type(e).__name__)
        return 0  # fail-open


def is_pwned(password: str) -> bool:
    return breach_count(password) > 0
