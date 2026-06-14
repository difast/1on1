"""Server-side authentication / authorization.

This is the security foundation for billing: until now every endpoint was open
and "admin" was only gated on the client. Here we add real, server-side checks.

IMPORTANT — safe rollout:
  Enforcement is OFF by default and only turns on when AUTH_ENFORCE is set
  (1/true/yes). While OFF, every dependency is a no-op and behaviour is exactly
  as before — so deploying this cannot break access. Turn it on only after
  SUPABASE_JWT_SECRET (and, for admin, ADMIN_API_TOKEN) are set in the
  environment.

Token model:
  The mobile app and web send the Supabase access token as
  `Authorization: Bearer <jwt>`. Supabase signs it HS256 with the project's JWT
  secret. We verify the signature, read the email claim, and map it to the app
  user (the app already keys users by email).
"""
import os

try:
    import jwt  # PyJWT
except Exception:  # pragma: no cover - dependency may not be installed yet
    jwt = None

from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User


def auth_enforced() -> bool:
    """Master switch. Keep OFF until secrets are configured in the environment."""
    return os.getenv("AUTH_ENFORCE", "").lower() in ("1", "true", "yes")


def _decode(token: str):
    secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not secret or jwt is None:
        return None
    try:
        # Supabase uses aud="authenticated"; we don't pin it to stay flexible.
        return jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except Exception:
        return None


def _token_from_header(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    """Best-effort resolve the authenticated app user from the bearer token.

    Returns the User or None. Raises 401 only when enforcement is ON and the
    token is missing/invalid.
    """
    token = _token_from_header(authorization)
    claims = _decode(token) if token else None
    user = None
    if claims:
        email = claims.get("email") or (claims.get("user_metadata") or {}).get("email")
        if email:
            user = db.query(User).filter(User.email == email).first()

    if auth_enforced() and user is None:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    return user


def require_user(user=Depends(get_current_user)):
    """Dependency for endpoints that need a logged-in user (when enforced)."""
    if auth_enforced() and user is None:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    return user


def require_admin(
    x_admin_token: str = Header(None),
    user=Depends(get_current_user),
):
    """Admin guard.

    When enforcement is OFF this is a no-op (returns whatever user we have), so
    existing admin screens keep working until you flip AUTH_ENFORCE on.

    When ON, access is granted if either:
      • the X-Admin-Token header matches ADMIN_API_TOKEN, or
      • the resolved user has role == 'admin'.
    """
    if not auth_enforced():
        return user

    admin_token = os.getenv("ADMIN_API_TOKEN", "")
    if admin_token and x_admin_token and x_admin_token == admin_token:
        return user
    if user is not None and getattr(user, "role", None) == "admin":
        return user
    raise HTTPException(status_code=403, detail="Только для администратора")
