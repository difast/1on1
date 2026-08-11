"""Ограничение частоты запросов (rate limiting).

Зачем: без лимитов эндпоинты входа и сброса пароля открыты для перебора, форма
повторной отправки письма превращается в средство спама на чужой адрес, а
AI-эндпоинты — в способ потратить чужие деньги на AI Gateway.

Алгоритм — скользящее окно по времени: храним отметки времени последних
попыток и считаем, сколько их попало в окно. По сравнению с фиксированным
окном не даёт всплеска на стыке двух окон (2N запросов за миг вокруг границы).

Хранилище выбирается автоматически:
  - Redis, если REDIS_URL указывает на доступный сервер. Нужен, когда
    приложение работает больше чем в одном процессе: счётчики общие.
  - Память процесса — запасной вариант. Backend на Timeweb сейчас работает
    одним контейнером, поэтому этого достаточно.

Отказ Redis НИКОГДА не роняет запрос: при ошибке связи молча переключаемся на
память процесса. Лимит — защитная мера, из-за неё пользователь не должен
получать ошибку, если само хранилище недоступно.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request

log = logging.getLogger("ratelimit")


@dataclass(frozen=True)
class Rule:
    """Правило лимита: не более `limit` событий за `window` секунд.

    `scope` попадает в ключ, поэтому лимиты разных категорий не смешиваются
    (вход, сброс пароля и AI считаются отдельно для одного и того же клиента).
    """
    scope: str
    limit: int
    window: int

    @property
    def retry_after(self) -> int:
        """Сколько ждать до следующей попытки в худшем случае."""
        return self.window


# ── Хранилища ────────────────────────────────────────────────────────────────

class _MemoryStore:
    """Счётчики в памяти процесса. Потокобезопасен."""

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_gc = 0.0

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Учесть попытку. Возвращает (разрешено, через_сколько_секунд_можно)."""
        now = time.monotonic()
        with self._lock:
            self._gc(now)
            q = self._hits[key]
            cutoff = now - window
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= limit:
                # Освободится, когда самая старая попытка выйдет из окна.
                return False, max(1, int(q[0] + window - now) + 1)
            q.append(now)
            return True, 0

    def _gc(self, now: float) -> None:
        """Раз в минуту выбрасываем ключи, по которым давно не было попыток, —
        иначе словарь растёт неограниченно от разовых посетителей."""
        if now - self._last_gc < 60:
            return
        self._last_gc = now
        dead = [k for k, q in self._hits.items() if not q or now - q[-1] > 3600]
        for k in dead:
            self._hits.pop(k, None)


class _RedisStore:
    """Счётчики в Redis: скользящее окно на сортированном множестве."""

    def __init__(self, client) -> None:
        self._r = client

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.time()
        member = f"{now:.6f}:{id(self):x}"
        pipe = self._r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {member: now})
        pipe.zcard(key)
        pipe.expire(key, window + 1)
        count = pipe.execute()[2]
        if count > limit:
            # Своя отметка не должна засчитываться как использованная попытка,
            # раз запрос всё равно отклонён.
            self._r.zrem(key, member)
            oldest = self._r.zrange(key, 0, 0, withscores=True)
            wait = int(oldest[0][1] + window - now) + 1 if oldest else window
            return False, max(1, wait)
        return True, 0


_store = None
_store_lock = threading.Lock()


def _get_store():
    """Ленивый выбор хранилища. Redis пробуем один раз; если он недоступен —
    навсегда остаёмся на памяти процесса и пишем об этом одну строку в лог."""
    global _store
    if _store is not None:
        return _store
    with _store_lock:
        if _store is not None:
            return _store
        _store = _MemoryStore()
        try:
            from app.config import settings
            import redis as _redis
            client = _redis.Redis.from_url(
                settings.redis_url, socket_connect_timeout=1, socket_timeout=1,
            )
            client.ping()
            _store = _RedisStore(client)
            log.info("Лимиты запросов: хранилище Redis")
        except Exception as e:
            log.info("Лимиты запросов: хранилище в памяти процесса (Redis недоступен: %s)", e)
        return _store


# ── Определение клиента ──────────────────────────────────────────────────────

def client_ip(request: Request) -> str:
    """IP клиента с учётом обратного прокси.

    Timeweb App Platform проксирует запросы, поэтому request.client.host — это
    адрес прокси, одинаковый для всех. Берём первый адрес из X-Forwarded-For
    (его подставляет прокси; клиент может добавить свой, но он окажется правее).
    """
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first[:64]
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real[:64]
    return request.client.host if request.client else "unknown"


def _key(rule: Rule, ident: str) -> str:
    return f"rl:{rule.scope}:{ident}"


# ── Основной интерфейс ───────────────────────────────────────────────────────

def check(rule: Rule, ident: str) -> None:
    """Учесть попытку и бросить 429, если лимит исчерпан.

    В ответе — понятный текст и заголовок Retry-After, чтобы клиент знал, через
    сколько повторять, а не гадал по общей ошибке.
    """
    try:
        allowed, wait = _get_store().hit(_key(rule, ident), rule.limit, rule.window)
    except Exception as e:
        # Сбой хранилища не должен ломать работу продукта.
        log.warning("Лимит не проверен (%s): %s", rule.scope, e)
        return
    if allowed:
        return
    raise HTTPException(
        status_code=429,
        detail=f"Слишком много запросов. Повторите через {wait} с.",
        headers={"Retry-After": str(wait)},
    )


def check_request(rule: Rule, request: Request, extra: str = "") -> None:
    """Лимит по IP клиента (плюс необязательное уточнение — email, user_id)."""
    ident = client_ip(request)
    if extra:
        ident = f"{ident}|{extra}"
    check(rule, ident)


def reset(rule: Rule, ident: str) -> None:
    """Сбросить счётчик — вызывается после успешного входа, чтобы неудачные
    попытки перед верным паролем не мешали дальнейшей работе."""
    try:
        store = _get_store()
        key = _key(rule, ident)
        if isinstance(store, _MemoryStore):
            with store._lock:
                store._hits.pop(key, None)
        else:
            store._r.delete(key)
    except Exception:
        pass


# ── Наборы правил по категориям ──────────────────────────────────────────────
# Значения подобраны так, чтобы не мешать обычному пользователю: живой человек
# не входит десять раз в минуту и не запрашивает сброс пароля пять раз подряд.

# Вход: подбор пароля. Считаем и по IP, и по конкретному email, чтобы перебор
# одного аккаунта с разных адресов тоже упирался в лимит.
LOGIN_IP = Rule("login-ip", limit=10, window=60)
LOGIN_ACCOUNT = Rule("login-acct", limit=5, window=300)
# Блок 1: комбинация IP+email — 5 неудачных попыток за 15 минут на пару.
# Слой поверх капчи (не вместо): capча и rate limit работают вместе.
LOGIN_COMBO = Rule("login-combo", limit=5, window=900)

# Регистрация: массовое создание аккаунтов с одного адреса.
REGISTER = Rule("register", limit=5, window=3600)

# Письма (сброс пароля, повторное подтверждение): защита от спама на чужой
# адрес. Лимит и по IP, и по адресу получателя.
EMAIL_IP = Rule("email-ip", limit=10, window=3600)
EMAIL_TARGET = Rule("email-target", limit=3, window=3600)

# Вход администратора: подбор пароля админки.
ADMIN_LOGIN = Rule("admin-login", limit=5, window=900)

# AI: и защита от перегрузки, и защита счёта за AI Gateway. Считаем на
# пользователя — один человек в диалоге с Питом не пишет чаще.
AI_USER = Rule("ai-user", limit=20, window=60)
AI_USER_HOURLY = Rule("ai-user-hour", limit=200, window=3600)

# Тяжёлые аналитические запросы ONE AI — дороже обычного ответа.
AI_HEAVY = Rule("ai-heavy", limit=10, window=60)

# Подсказки по компании: за каждым запросом платный вызов справочника DaData.
# Лимит выше скорости набора в поле поиска, но отсекает выкачивание справочника.
SUGGEST = Rule("suggest", limit=30, window=60)

# Загрузка записи звонка: файлы крупные, обрабатываются в фоне.
UPLOAD = Rule("upload", limit=10, window=600)

# Общий потолок на API для одного адреса — верхняя граница против простого
# наводнения запросами. Заведомо выше нормального использования интерфейса.
GLOBAL_API = Rule("api", limit=300, window=60)
