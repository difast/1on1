"""Определение региона (страны) пользователя по IP — Этап 5.

Назначение: подставить валюту/провайдера ПОЗЖЕ (в задаче по биллингу). Сейчас —
только определяем и сохраняем `detected_region` как ПРЕДПОЛАГАЕМЫЙ регион.
Источник истины для платёжного провайдера остаётся страна юрлица (company),
когда она есть; detected_region — временная замена, пока компании нет.

Стратегия (офлайн-первый, чтобы не дёргать внешний API на каждый запрос):
  1. Заголовки CDN/прокси, если платформа их проставляет (Cloudflare и т.п.).
  2. Офлайн-база MaxMind GeoIP2, если задан GEOIP_DB_PATH и установлен geoip2.
  3. Внешний IP-API (ip-api.com, без ключа) — как крайняя мера. Вызывается
     максимум один раз на пользователя: результат кэшируется в users.detected_region,
     повторно IP не резолвится, если регион уже определён.
Любая ошибка -> None (никогда не блокируем и не роняем запрос).
"""
import os
import ipaddress

import httpx

# Заголовки, которые проставляют популярные прокси/CDN с готовым кодом страны.
_COUNTRY_HEADERS = (
    "cf-ipcountry",           # Cloudflare
    "x-vercel-ip-country",    # Vercel
    "x-country-code",
    "x-geo-country",
)


def client_ip(request) -> str | None:
    """Первый (клиентский) IP из X-Forwarded-For, иначе прямой адрес."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        ip = xff.split(",")[0].strip()
        if ip:
            return ip
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    client = getattr(request, "client", None)
    return client.host if client else None


def _is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return not (addr.is_private or addr.is_loopback or addr.is_link_local
                    or addr.is_reserved or addr.is_unspecified)
    except ValueError:
        return False


def _from_headers(request) -> str | None:
    for h in _COUNTRY_HEADERS:
        val = request.headers.get(h)
        if val and len(val.strip()) == 2 and val.strip().upper() != "XX":
            return val.strip().upper()
    return None


def _from_geoip_db(ip: str) -> str | None:
    path = os.getenv("GEOIP_DB_PATH", "")
    if not path or not os.path.exists(path):
        return None
    try:
        import geoip2.database  # optional dependency
        with geoip2.database.Reader(path) as reader:
            return (reader.country(ip).country.iso_code or None)
    except Exception:
        return None


def _from_ip_api(ip: str) -> str | None:
    """Крайняя мера: бесплатный ip-api.com (без ключа). Вызывается редко —
    только когда регион ещё не сохранён у пользователя."""
    try:
        r = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,countryCode"},
            timeout=4,
        )
        j = r.json()
        if j.get("status") == "success":
            return (j.get("countryCode") or "").upper() or None
    except Exception:
        pass
    return None


def detect_region(request) -> str | None:
    """Вернуть ISO-код страны (2 буквы) или None. Порядок — как в докстроке."""
    # 1. Заголовки прокси/CDN — бесплатно и без внешних вызовов.
    code = _from_headers(request)
    if code:
        return code

    ip = client_ip(request)
    if not ip or not _is_public(ip):
        return None

    # 2. Офлайн-база (если сконфигурирована).
    code = _from_geoip_db(ip)
    if code:
        return code

    # 3. Внешний API (последняя попытка).
    return _from_ip_api(ip)
