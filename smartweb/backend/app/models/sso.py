"""SSO-подключение для Enterprise (Блок 9, Этап 2).

Одна запись на подключение корпоративного Identity Provider к организации
(team_id). Техническая база: хранит конфигурацию OIDC (и поля для будущего SAML).
Секрет клиента OIDC хранится в ЗАШИФРОВАННОМ виде (crypto), в открытом — никогда.

Подключение создаётся администратором для организации на тарифе Enterprise
(проверка фичи sso). Вход по подключению выдаёт наш JWT тем же механизмом, что и
остальные способы входа.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, func
from app.database import Base


class SsoConnection(Base):
    __tablename__ = "sso_connections"

    id = Column(Integer, primary_key=True)
    # Организация (team_id из модели изоляции Блока 3), к которой относится SSO.
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    # Короткий идентификатор в URL: /api/auth/sso/{slug}/authorize.
    slug = Column(String(64), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    protocol = Column(String(10), nullable=False, default="oidc", server_default="oidc")  # oidc | saml
    enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    # Ограничение по домену email (напр. "vtb.ru") — принимать только пользователей
    # с корпоративной почтой. NULL — без ограничения по домену.
    allowed_email_domain = Column(String(255), nullable=True)

    # ── OIDC ──
    oidc_issuer = Column(String(500), nullable=True)               # для discovery
    oidc_client_id = Column(String(500), nullable=True)
    oidc_client_secret_enc = Column(Text, nullable=True)           # шифруется
    oidc_authorization_endpoint = Column(String(500), nullable=True)
    oidc_token_endpoint = Column(String(500), nullable=True)
    oidc_userinfo_endpoint = Column(String(500), nullable=True)
    oidc_redirect_uri = Column(String(500), nullable=True)
    oidc_scopes = Column(String(255), nullable=True, default="openid email profile")

    # ── SAML (поля-заглушки для будущей интеграции) ──
    saml_entity_id = Column(String(500), nullable=True)
    saml_sso_url = Column(String(500), nullable=True)
    saml_x509_cert = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
