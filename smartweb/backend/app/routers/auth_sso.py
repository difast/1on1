"""SSO для Enterprise (Блок 9, Этап 2): эндпоинты.

Публичные (вход по SSO):
  GET  /api/auth/sso/{slug}/authorize   -> URL страницы согласия IdP + state
  POST /api/auth/sso/{slug}/callback    -> code -> профиль -> наш JWT
  GET  /api/auth/sso/{slug}/metadata    -> SP-metadata (SAML, для настройки IdP)

Административные (настройка подключений владельцем панели, require_admin):
  POST   /api/admin/sso                 -> создать подключение (Enterprise)
  GET    /api/admin/sso                 -> список
  DELETE /api/admin/sso/{id}            -> удалить

SSO выдаёт JWT ТЕМ ЖЕ механизмом, что и остальные входы (create_access_token +
серверная сессия), и не затрагивает email/пароль, Yandex ID, VK ID, Telegram.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.user import UserOut
from app.utils.auth import create_access_token, require_admin
from app.utils import ratelimit
from app.services import oauth_state, sso as sso_service, crypto
from app.models.sso import SsoConnection
from app.models.team import Team
from app.models.user import User

router = APIRouter()          # монтируется на /api/auth/sso
admin_router = APIRouter()    # монтируется на /api/admin/sso
log = logging.getLogger("auth_sso")

STATE_MAX_AGE = 15 * 60


def _flow(slug: str) -> str:
    return f"sso:{slug}"


# ── публичный вход ────────────────────────────────────────────────────────────

@router.get("/{slug}/authorize")
def authorize(slug: str, db: Session = Depends(get_db)):
    conn = sso_service.get_connection(db, slug)
    if not conn or conn.protocol != "oidc":
        raise HTTPException(status_code=404, detail="SSO-подключение не найдено")
    state = oauth_state.make_state(0, _flow(slug))
    try:
        url = sso_service.authorize_url(conn, state)
    except sso_service.SsoError:
        raise HTTPException(status_code=400, detail="SSO настроено не полностью")
    return {"url": url, "state": state}


class SsoCallbackReq(BaseModel):
    code: str = Field(max_length=4096)
    state: str = Field(max_length=4096)


@router.post("/{slug}/callback")
def callback(slug: str, data: SsoCallbackReq, request: Request, db: Session = Depends(get_db)):
    ratelimit.check_request(ratelimit.LOGIN_IP, request)
    conn = sso_service.get_connection(db, slug)
    if not conn:
        raise HTTPException(status_code=404, detail="SSO-подключение не найдено")
    if oauth_state.read_state(data.state, _flow(slug), max_age=STATE_MAX_AGE) is None:
        raise HTTPException(status_code=400, detail="Недействительный state")
    try:
        profile = sso_service.exchange_and_profile(conn, data.code)
        user, status = sso_service.find_or_create_user(db, conn, profile)
    except sso_service.SsoError as e:
        raise HTTPException(status_code=400, detail=f"Вход по SSO не удался: {e}")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    # Выдаём JWT + серверную сессию — как остальные способы входа.
    from app.services import sessions as sess, audit
    ip = ratelimit.client_ip(request)
    jti = sess.new_jti()
    sess.create_session(db, user.id, jti, user_agent=request.headers.get("user-agent"), ip=ip)
    audit.record(db, "auth.sso_login", actor_id=user.id, entity_type="user", entity_id=user.id,
                 organization_id=conn.team_id, category="auth", ip=ip,
                 summary=f"Вход по SSO ({slug})")
    return {"status": status, "user": UserOut.model_validate(user).model_dump(),
            "token": create_access_token(user.id, jti=jti)}


@router.get("/{slug}/metadata")
def saml_metadata(slug: str, request: Request, db: Session = Depends(get_db)):
    conn = db.query(SsoConnection).filter(SsoConnection.slug == slug).first()
    if not conn:
        raise HTTPException(status_code=404, detail="SSO-подключение не найдено")
    base = str(request.base_url).rstrip("/")
    acs = f"{base}/api/auth/sso/{slug}/acs"
    entity_id = conn.saml_entity_id or f"{base}/api/auth/sso/{slug}"
    from fastapi.responses import Response
    return Response(content=sso_service.sp_metadata_xml(conn, acs, entity_id),
                    media_type="application/xml")


@router.post("/{slug}/acs")
def saml_acs(slug: str):
    """Assertion Consumer Service (SAML). Полная проверка подписи SAML-ответа
    подключается при индивидуальной интеграции (библиотека подписи XML) — до этого
    приём ответа намеренно не активирован, чтобы не принимать непроверенные
    утверждения. См. отчёт."""
    raise HTTPException(status_code=501, detail={
        "code": "saml_not_activated",
        "message": "SAML ACS активируется при индивидуальной настройке Enterprise-интеграции. "
                   "Используйте OIDC либо обратитесь к нам для подключения SAML.",
    })


# ── админ: управление подключениями ───────────────────────────────────────────

class SsoCreateReq(BaseModel):
    team_id: int
    slug: str = Field(max_length=64)
    display_name: Optional[str] = Field(default=None, max_length=255)
    allowed_email_domain: Optional[str] = Field(default=None, max_length=255)
    oidc_issuer: Optional[str] = Field(default=None, max_length=500)
    oidc_client_id: Optional[str] = Field(default=None, max_length=500)
    oidc_client_secret: Optional[str] = Field(default=None, max_length=1000)
    oidc_authorization_endpoint: Optional[str] = Field(default=None, max_length=500)
    oidc_token_endpoint: Optional[str] = Field(default=None, max_length=500)
    oidc_userinfo_endpoint: Optional[str] = Field(default=None, max_length=500)
    oidc_redirect_uri: Optional[str] = Field(default=None, max_length=500)
    oidc_scopes: Optional[str] = Field(default="openid email profile", max_length=255)
    enabled: bool = True


def _enterprise_ok(db: Session, team_id: int) -> bool:
    """SSO доступен только организации на Enterprise (фича sso). Проверяем по
    владельцу команды."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return False
    from app.services import entitlements
    lead = db.query(User).filter(User.id == team.team_lead_id).first()
    limits = entitlements.effective_limits(db, lead)
    return entitlements.feature_enabled(limits, "sso")


def _dict(c: SsoConnection) -> dict:
    return {
        "id": c.id, "team_id": c.team_id, "slug": c.slug, "protocol": c.protocol,
        "display_name": c.display_name, "enabled": c.enabled,
        "allowed_email_domain": c.allowed_email_domain,
        "oidc_issuer": c.oidc_issuer, "oidc_client_id": c.oidc_client_id,
        "oidc_redirect_uri": c.oidc_redirect_uri,
        "has_client_secret": bool(c.oidc_client_secret_enc),
    }


@admin_router.get("")
@admin_router.get("/")
def list_sso(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return {"connections": [_dict(c) for c in db.query(SsoConnection).order_by(SsoConnection.id.desc()).all()]}


@admin_router.post("")
@admin_router.post("/")
def create_sso(data: SsoCreateReq, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    if db.query(Team).filter(Team.id == data.team_id).first() is None:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    # SSO — только для Enterprise-организации (техническая привязка к тарифу).
    if not _enterprise_ok(db, data.team_id):
        raise HTTPException(status_code=402, detail={
            "code": "feature_locked", "feature": "sso",
            "message": "SSO доступно на тарифе Enterprise. Свяжитесь с нами для подключения.",
        })
    if db.query(SsoConnection).filter(SsoConnection.slug == data.slug).first():
        raise HTTPException(status_code=400, detail="slug уже занят")
    conn = SsoConnection(
        team_id=data.team_id, slug=data.slug, display_name=data.display_name,
        protocol="oidc", enabled=data.enabled, allowed_email_domain=data.allowed_email_domain,
        oidc_issuer=data.oidc_issuer, oidc_client_id=data.oidc_client_id,
        oidc_client_secret_enc=crypto.encrypt(data.oidc_client_secret),
        oidc_authorization_endpoint=data.oidc_authorization_endpoint,
        oidc_token_endpoint=data.oidc_token_endpoint,
        oidc_userinfo_endpoint=data.oidc_userinfo_endpoint,
        oidc_redirect_uri=data.oidc_redirect_uri,
        oidc_scopes=data.oidc_scopes or "openid email profile",
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    from app.services import audit
    audit.record(db, "admin.sso_created", actor_id=None, entity_type="sso_connection",
                 entity_id=conn.id, organization_id=data.team_id, category="admin",
                 summary=f"Создано SSO-подключение ({data.slug})")
    return _dict(conn)


@admin_router.delete("/{conn_id}")
def delete_sso(conn_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    conn = db.query(SsoConnection).filter(SsoConnection.id == conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Не найдено")
    db.delete(conn)
    db.commit()
    from app.services import audit
    audit.record(db, "admin.sso_deleted", actor_id=None, entity_type="sso_connection",
                 entity_id=conn_id, category="admin", summary="Удалено SSO-подключение")
    return {"ok": True}
