"""Сессии и известные устройства (Блок 1, Этапы 4/6/7).

Сессия = запись UserSession, привязанная к JWT через claim jti. Позволяет:
  - показать список активных сессий/устройств (Этап 6);
  - завершить конкретную сессию / все кроме текущей (Этап 6);
  - завершить все сессии при смене пароля (Этап 6);
  - автовыход по бездействию (Этап 7) — по last_active_at.

Устройство = UserDevice. Вход с неизвестного устройства требует подтверждения
кодом по email (Этап 4). Идентификатор устройства с клиента хранится как хэш.
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.auth_security import UserSession, UserDevice


# ── device label из user-agent ────────────────────────────────────────────────

def device_label(user_agent: Optional[str]) -> str:
    """Короткая человекочитаемая метка устройства/браузера из UA. Не секрет."""
    ua = (user_agent or "").strip()
    if not ua:
        return "Неизвестное устройство"
    low = ua.lower()
    if "oneonone" in low or "expo" in low or "okhttp" in low or "cfnetwork" in low:
        os_ = ("iOS" if ("iphone" in low or "ios" in low or "cfnetwork" in low)
               else "Android" if "android" in low else "Мобильное приложение")
        return f"Приложение OneOnOne ({os_})"
    browser = ("Chrome" if "chrome" in low and "edg" not in low else
               "Edge" if "edg" in low else
               "Safari" if "safari" in low and "chrome" not in low else
               "Firefox" if "firefox" in low else "Браузер")
    os_ = ("Windows" if "windows" in low else
           "macOS" if "mac os" in low or "macintosh" in low else
           "iOS" if "iphone" in low or "ipad" in low else
           "Android" if "android" in low else
           "Linux" if "linux" in low else "")
    return f"{browser}{' на ' + os_ if os_ else ''}"


# ── сессии ─────────────────────────────────────────────────────────────────────

def new_jti() -> str:
    return secrets.token_urlsafe(24)


def create_session(db: Session, user_id: int, jti: str, *,
                   user_agent: Optional[str] = None, ip: Optional[str] = None) -> UserSession:
    s = UserSession(user_id=user_id, jti=jti, device_label=device_label(user_agent), ip=ip)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def list_active(db: Session, user_id: int):
    return (db.query(UserSession)
            .filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.last_active_at.desc())
            .all())


def revoke_session(db: Session, user_id: int, session_id: int) -> bool:
    s = (db.query(UserSession)
         .filter(UserSession.id == session_id, UserSession.user_id == user_id,
                 UserSession.revoked_at.is_(None))
         .first())
    if not s:
        return False
    s.revoked_at = datetime.utcnow()
    db.commit()
    return True


def revoke_others(db: Session, user_id: int, keep_jti: Optional[str]) -> int:
    q = (db.query(UserSession)
         .filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None)))
    if keep_jti:
        q = q.filter(UserSession.jti != keep_jti)
    n = 0
    for s in q.all():
        s.revoked_at = datetime.utcnow()
        n += 1
    db.commit()
    return n


def get_by_jti(db: Session, jti: str) -> Optional[UserSession]:
    return db.query(UserSession).filter(UserSession.jti == jti).first()


def is_active(session: Optional[UserSession]) -> bool:
    """Активна ли сессия: не отозвана и не «протухла» по бездействию (Этап 7)."""
    if session is None:
        return False
    if session.revoked_at is not None:
        return False
    idle_cut = datetime.utcnow() - timedelta(days=settings.session_idle_days)
    if session.last_active_at and session.last_active_at < idle_cut:
        return False
    return True


def touch(db: Session, session: UserSession) -> None:
    """Обновить last_active_at (с троттлингом ~5 мин, чтобы не писать на каждый
    запрос). Автовыход по бездействию считается именно по этому полю."""
    now = datetime.utcnow()
    if not session.last_active_at or (now - session.last_active_at) > timedelta(minutes=5):
        session.last_active_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()


# ── устройства ─────────────────────────────────────────────────────────────────

def hash_device(raw: Optional[str]) -> Optional[str]:
    """Хэш идентификатора устройства с клиента (в БД не храним сырой)."""
    if not raw:
        return None
    return hashlib.sha256(f"oneonone-device:{raw}".encode("utf-8")).hexdigest()


def known_device(db: Session, user_id: int, device_hash: Optional[str]) -> Optional[UserDevice]:
    if not device_hash:
        return None
    return (db.query(UserDevice)
            .filter(UserDevice.user_id == user_id, UserDevice.device_hash == device_hash,
                    UserDevice.trusted == True)  # noqa: E712
            .first())


def remember_device(db: Session, user_id: int, device_hash: Optional[str], *,
                    user_agent: Optional[str] = None, ip: Optional[str] = None,
                    trusted: bool = True) -> Optional[UserDevice]:
    if not device_hash:
        return None
    d = (db.query(UserDevice)
         .filter(UserDevice.user_id == user_id, UserDevice.device_hash == device_hash)
         .first())
    if d:
        d.trusted = d.trusted or trusted
        d.last_seen_at = datetime.utcnow()
        if ip:
            d.ip = ip
    else:
        d = UserDevice(user_id=user_id, device_hash=device_hash,
                       label=device_label(user_agent), ip=ip, trusted=trusted)
        db.add(d)
    db.commit()
    return d
