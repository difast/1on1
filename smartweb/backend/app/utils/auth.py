"""Собственная серверная аутентификация (email/пароль + JWT).

Supabase убран полностью. Токен — наш JWT, подписанный HS256 ключом из
окружения (JWT_SECRET). В токене хранится user_id (claim "sub"). Клиенты
присылают его в заголовке Authorization: Bearer <jwt>.

Зависимости:
  get_current_user — best-effort: возвращает User или None (не бросает).
  require_user     — строгая: 401, если токена нет или он невалиден/просрочен.
                     Именно её вешаем на все защищённые эндпоинты (Этап 8).
  require_admin    — доступ только администратору.
"""
import os
import jwt  # PyJWT
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.config import settings


def create_access_token(user_id: int) -> str:
    """Выдать JWT для пользователя. Секрет — только из окружения."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_signing_key, algorithm="HS256")


def create_admin_token() -> str:
    """JWT администратора (claim admin=true). Нужен, чтобы запросы админ-панели
    проходили гейт AUTH_ENFORCE (валидный токен) и распознавались в require_admin.
    Пользователя за токеном нет — админ-панель не привязана к users-аккаунту."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "admin",
        "admin": True,
        "iat": int(now.timestamp()),
        # Срок как у обычной сессии, чтобы восстановление админки после F5 не
        # переживало срок действия токена.
        "exp": int((now + timedelta(days=settings.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_signing_key, algorithm="HS256")


def _admin_claim_from_header(authorization: str | None) -> bool:
    """True, если в Authorization лежит валидный JWT с claim admin=true."""
    token = _token_from_header(authorization)
    claims = _decode(token) if token else None
    return bool(claims and claims.get("admin") is True)


def _decode(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_signing_key, algorithms=["HS256"])
    except Exception:
        return None


def _token_from_header(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    """Best-effort: вернуть пользователя из токена или None. Не бросает 401."""
    token = _token_from_header(authorization)
    claims = _decode(token) if token else None
    if not claims:
        return None
    sub = claims.get("sub")
    if sub is None:
        return None
    try:
        uid = int(sub)
    except (TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == uid).first()


def require_user(user=Depends(get_current_user)):
    """Строгая проверка. 401, если нет валидного токена (Этап 8)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    if getattr(user, "is_blocked", False):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    return user


def require_admin(
    authorization: str = Header(None),
    x_admin_token: str = Header(None),
    user=Depends(get_current_user),
):
    """Гвард администратора.

    Доступ, если:
      - в Authorization лежит админ-JWT (claim admin=true, выдаётся
        /auth/admin-login по паролю администратора), или
      - заголовок X-Admin-Token совпадает с ADMIN_API_TOKEN из окружения, или
      - у пользователя из токена role == 'admin'.

    Админ-JWT работает независимо от ADMIN_API_TOKEN и проходит гейт AUTH_ENFORCE,
    поэтому админ-панель функционирует и при включённой принудительной авторизации.
    """
    # 1) Админ-JWT (по паролю) — основной путь для админ-панели.
    if _admin_claim_from_header(authorization):
        return None
    admin_token = os.getenv("ADMIN_API_TOKEN", "")
    if admin_token:
        if x_admin_token and x_admin_token == admin_token:
            return user
        if user is not None and getattr(user, "role", None) == "admin":
            return user
        raise HTTPException(status_code=403, detail="Только для администратора")
    # ADMIN_API_TOKEN не настроен — прежнее поведение (совместимость).
    return user
