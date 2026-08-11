"""SSO для Enterprise (Блок 9, Этап 2): техническая база.

OIDC реализован полностью через authorization code flow + userinfo endpoint:
  authorize -> IdP -> code -> обмен code на access_token (token endpoint,
  client_secret) -> профиль через userinfo endpoint -> find-or-create -> наш JWT.

Почему через userinfo, а не по подписи id_token: проверка RS256-подписи id_token
требует нативной зависимости (cryptography), которой в проекте сознательно нет.
Code flow с обменом на доверенном token endpoint по TLS и запросом userinfo по
TLS с полученным access_token — легитимный и безопасный вариант OIDC. Все вызовы
к IdP идут server-to-server по HTTPS.

SAML: предоставлены SP-metadata и заглушка ACS; полная проверка подписи
SAML-ответа требует библиотеки подписи XML и включается при индивидуальной
интеграции (см. отчёт).
"""
import logging
from typing import Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from app.models.sso import SsoConnection
from app.models.user import User
from app.models.team import Team, TeamMember
from app.services import crypto

log = logging.getLogger("sso")


class SsoError(Exception):
    pass


def get_connection(db: Session, slug: str) -> Optional[SsoConnection]:
    return db.query(SsoConnection).filter(SsoConnection.slug == slug,
                                          SsoConnection.enabled == True).first()  # noqa: E712


def discover(issuer: str) -> dict:
    """OIDC discovery: подтянуть endpoints из issuer/.well-known/openid-configuration."""
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    r = httpx.get(url, timeout=8)
    r.raise_for_status()
    return r.json() or {}


def _endpoints(conn: SsoConnection) -> dict:
    """Endpoints OIDC: заданные явно либо через discovery по issuer."""
    if conn.oidc_authorization_endpoint and conn.oidc_token_endpoint and conn.oidc_userinfo_endpoint:
        return {
            "authorization_endpoint": conn.oidc_authorization_endpoint,
            "token_endpoint": conn.oidc_token_endpoint,
            "userinfo_endpoint": conn.oidc_userinfo_endpoint,
        }
    if conn.oidc_issuer:
        d = discover(conn.oidc_issuer)
        return {
            "authorization_endpoint": d.get("authorization_endpoint"),
            "token_endpoint": d.get("token_endpoint"),
            "userinfo_endpoint": d.get("userinfo_endpoint"),
        }
    raise SsoError("OIDC endpoints not configured")


def authorize_url(conn: SsoConnection, state: str) -> str:
    from urllib.parse import urlencode
    eps = _endpoints(conn)
    params = {
        "response_type": "code",
        "client_id": conn.oidc_client_id or "",
        "redirect_uri": conn.oidc_redirect_uri or "",
        "scope": conn.oidc_scopes or "openid email profile",
        "state": state,
    }
    return f"{eps['authorization_endpoint']}?{urlencode(params)}"


def exchange_and_profile(conn: SsoConnection, code: str) -> dict:
    """code -> access_token -> профиль {sub, email, name}. Всё по TLS."""
    eps = _endpoints(conn)
    secret = crypto.decrypt(conn.oidc_client_secret_enc) or ""
    try:
        tr = httpx.post(eps["token_endpoint"], data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": conn.oidc_redirect_uri or "",
            "client_id": conn.oidc_client_id or "",
            "client_secret": secret,
        }, headers={"Accept": "application/json"}, timeout=10)
        tr.raise_for_status()
        access = (tr.json() or {}).get("access_token")
        if not access:
            raise SsoError("no access_token from IdP")
        ur = httpx.get(eps["userinfo_endpoint"],
                       headers={"Authorization": f"Bearer {access}"}, timeout=10)
        ur.raise_for_status()
        info = ur.json() or {}
    except SsoError:
        raise
    except Exception as e:
        log.warning("sso oidc exchange error: %s", type(e).__name__)
        raise SsoError("IdP exchange failed")
    email = (info.get("email") or "").strip().lower()
    return {
        "sub": info.get("sub"),
        "email": email,
        "name": info.get("name") or info.get("preferred_username") or (email.split("@")[0] if email else None),
    }


def find_or_create_user(db: Session, conn: SsoConnection, profile: dict) -> Tuple[User, str]:
    """Найти пользователя по email или создать и включить в организацию SSO.

    Enterprise-организация фиксирована подключением (conn.team_id). Домен email
    может быть ограничен (allowed_email_domain). Email считаем подтверждённым —
    его подтвердил корпоративный IdP."""
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise SsoError("IdP не вернул email")
    if conn.allowed_email_domain:
        if not email.endswith("@" + conn.allowed_email_domain.lower()):
            raise SsoError("Домен email не разрешён для этого подключения")

    user = db.query(User).filter(User.email == email).first()
    status = "login"
    if user is None:
        user = User(name=(profile.get("name") or email.split("@")[0]), email=email,
                    role="member", email_confirmed=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        status = "register"
        try:
            from app.services import subscriptions as subs
            subs.start_signup_trial(db, "user", user.id)
        except Exception:
            db.rollback()
    else:
        # Почта, подтверждённая корпоративным IdP, считается подтверждённой.
        if not user.email_confirmed:
            user.email_confirmed = True
            db.commit()

    # Включаем в организацию подключения, если ещё не состоит.
    team = db.query(Team).filter(Team.id == conn.team_id).first()
    if team:
        exists = db.query(TeamMember).filter(TeamMember.team_id == team.id,
                                             TeamMember.user_id == user.id).first()
        if not exists:
            db.add(TeamMember(team_id=team.id, user_id=user.id, role="member", cadence_days=7))
            db.commit()
    return user, status


# ── SAML SP metadata (scaffold) ───────────────────────────────────────────────

def sp_metadata_xml(conn: SsoConnection, acs_url: str, entity_id: str) -> str:
    """Метаданные Service Provider для передачи корпоративному IdP (SAML).

    Полная проверка подписи SAML-ответа включается при индивидуальной интеграции
    (требует библиотеки подписи XML) — см. отчёт. Метаданные отдаём уже сейчас,
    чтобы IdP-администратор клиента мог настроить свою сторону."""
    return (
        '<?xml version="1.0"?>\n'
        '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" '
        f'entityID="{entity_id}">\n'
        '  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" '
        'protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n'
        '    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>\n'
        '    <md:AssertionConsumerService '
        'Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" '
        f'Location="{acs_url}" index="0" isDefault="true"/>\n'
        '  </md:SPSSODescriptor>\n'
        '</md:EntityDescriptor>\n'
    )
