"""Единый сервис записи аудита (Блок 8) + базовый мониторинг безопасности.

Один переиспользуемый механизм для всех значимых событий — вызывается из
бизнес-логики, не разрозненные записи. Запись НИКОГДА не ломает основную
операцию: любые ошибки журналирования глушатся (best-effort).

КРИТИЧНО (Этап 3): в meta НИКОГДА не должны попадать пароли, токены, секреты,
платёжные данные. Любой словарь meta проходит рекурсивную редакцию redact():
значения полей с чувствительными именами заменяются на "[REDACTED]".
"""
import logging
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.team import Team, TeamMember

log = logging.getLogger("audit")

# Подстроки чувствительных имён полей. Проверяем вхождение без учёта регистра —
# покрывает password/password_hash/new_password, token/access_token/refresh_token,
# secret/webhook_secret, card/CardFirstSix, api_key, authorization, hash, otp,
# code_verifier, init_data.
_SENSITIVE_SUBSTRINGS = (
    "password", "passwd", "token", "secret", "authorization", "auth_header",
    "card", "cvv", "pan", "api_key", "apikey", "hash", "otp", "code_verifier",
    "init_data", "signature", "private", "refresh",
)
_REDACTED = "[REDACTED]"
_MAX_STR = 2000  # обрезаем слишком длинные строковые значения в meta


def _is_sensitive(key: str) -> bool:
    k = str(key).lower()
    return any(s in k for s in _SENSITIVE_SUBSTRINGS)


def redact(value, _depth: int = 0):
    """Рекурсивно замаскировать чувствительные поля в структуре meta."""
    if _depth > 6:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if _is_sensitive(k):
                out[k] = _REDACTED
            else:
                out[k] = redact(v, _depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [redact(v, _depth + 1) for v in value[:100]]
    if isinstance(value, str):
        return value if len(value) <= _MAX_STR else value[:_MAX_STR] + "..."
    return value


def org_of_team(db: Session, team_id: Optional[int]) -> Optional[int]:
    """organization_id == team_id (модель Блока 3). Хелпер для читаемости вызовов."""
    return team_id


def org_of_user(db: Session, user_id: Optional[int]) -> Optional[int]:
    """Организация пользователя: команда, где он тимлид, иначе первая его команда.
    Best-effort — для проставления organization_id в записи журнала."""
    if not user_id:
        return None
    try:
        t = db.query(Team.id).filter(Team.team_lead_id == user_id).first()
        if t:
            return t[0]
        tm = db.query(TeamMember.team_id).filter(TeamMember.user_id == user_id).first()
        return tm[0] if tm else None
    except Exception:
        return None


def record(db: Session, action_type: str, *,
           actor_id: Optional[int] = None,
           entity_type: Optional[str] = None,
           entity_id: Optional[int] = None,
           organization_id: Optional[int] = None,
           category: str = "general",
           summary: Optional[str] = None,
           meta: Optional[dict] = None,
           ip: Optional[str] = None) -> None:
    """Записать событие в единый журнал. Best-effort: ошибки не пробрасываются.

    meta проходит редакцию перед сохранением — чувствительные поля маскируются.
    """
    try:
        entry = AuditLog(
            actor_id=actor_id,
            action_type=action_type[:64],
            entity_type=(entity_type[:64] if entity_type else None),
            entity_id=entity_id,
            organization_id=organization_id,
            category=category if category in ("general", "security", "admin", "auth") else "general",
            summary=(summary[:500] if summary else None),
            meta=(redact(meta) if meta is not None else None),
            ip=(str(ip)[:64] if ip else None),
        )
        db.add(entry)
        db.commit()
    except Exception:
        # Журнал не должен ломать бизнес-операцию; откатываем свою неудачную запись.
        try:
            db.rollback()
        except Exception:
            pass
        log.warning("audit record failed: %s", action_type)


def client_ip(request) -> Optional[str]:
    """IP клиента из запроса (для событий безопасности/входа)."""
    if request is None:
        return None
    try:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        return request.client.host if request.client else None
    except Exception:
        return None


# ── Базовый мониторинг подозрительной активности (Этап 4) ─────────────────────
#
# Лёгкая in-memory агрегация: считаем неуспехи (401/403/429) в скользящем окне по
# ключу (actor или IP). При переходе порога пишем ОДНУ security-запись в журнал
# (а не по записи на каждый запрос — чтобы не заспамить). Структура расширяема до
# полноценного SIEM позже.

_WINDOW_SEC = 300          # окно агрегации, 5 минут
_THRESHOLD = 10            # столько неуспехов в окне -> подозрительно
_counters: dict = {}       # key -> {"count": int, "reset": ts, "flagged": bool}


def _bump(key: str) -> tuple:
    now = time.time()
    c = _counters.get(key)
    if c is None or now >= c["reset"]:
        c = {"count": 0, "reset": now + _WINDOW_SEC, "flagged": False}
        _counters[key] = c
    c["count"] += 1
    return c["count"], c["flagged"]


def _mark_flagged(key: str):
    c = _counters.get(key)
    if c:
        c["flagged"] = True


def note_failure(db: Session, *, status_code: int, actor_id: Optional[int],
                 ip: Optional[str], path: str) -> None:
    """Зафиксировать неуспешный запрос (401/403/429) для мониторинга. При переходе
    порога в окне — одна агрегированная security-запись в журнал."""
    key = f"u{actor_id}" if actor_id else f"ip{ip or 'unknown'}"
    count, flagged = _bump(key)
    if count >= _THRESHOLD and not flagged:
        _mark_flagged(key)
        kind = {401: "auth_failures", 403: "access_denied_burst",
                429: "rate_limited_burst"}.get(status_code, "suspicious")
        record(db, f"security.{kind}", actor_id=actor_id, category="security",
               ip=ip,
               summary=f"{count}+ неуспешных запросов ({status_code}) за {_WINDOW_SEC // 60} мин",
               meta={"count": count, "window_sec": _WINDOW_SEC, "last_status": status_code,
                     "last_path": path})


def suspicious_summary() -> dict:
    """Сводка текущих счётчиков для админ-панели (не персистентно, окно 5 мин)."""
    now = time.time()
    active = {k: v["count"] for k, v in _counters.items() if now < v["reset"]}
    return {
        "window_sec": _WINDOW_SEC,
        "threshold": _THRESHOLD,
        "active_keys": len(active),
        "flagged": [k for k, v in _counters.items() if now < v["reset"] and v["flagged"]],
        "top": sorted(active.items(), key=lambda kv: kv[1], reverse=True)[:10],
    }
