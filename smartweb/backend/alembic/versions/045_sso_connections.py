"""Блок 9: SSO-подключения (Enterprise). Техническая база OIDC/SAML.

Аддитивно и идемпотентно (миграции идут в фоне): создание таблицы с проверкой
существования, повторный прогон безопасен. Существующие данные не затрагиваются.
Прикладное шифрование полей встречи (notes/call_transcript/ai_summary) миграции
НЕ требует: тип колонки остаётся Text, шифрование прозрачно на уровне ORM.
"""
revision = "045"
down_revision = "044"

from alembic import op
import sqlalchemy as sa


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade():
    if _has_table("sso_connections"):
        return
    op.create_table(
        "sso_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("slug", sa.String(length=64), nullable=False, unique=True, index=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("protocol", sa.String(length=10), nullable=False, server_default="oidc"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("allowed_email_domain", sa.String(length=255), nullable=True),
        sa.Column("oidc_issuer", sa.String(length=500), nullable=True),
        sa.Column("oidc_client_id", sa.String(length=500), nullable=True),
        sa.Column("oidc_client_secret_enc", sa.Text(), nullable=True),
        sa.Column("oidc_authorization_endpoint", sa.String(length=500), nullable=True),
        sa.Column("oidc_token_endpoint", sa.String(length=500), nullable=True),
        sa.Column("oidc_userinfo_endpoint", sa.String(length=500), nullable=True),
        sa.Column("oidc_redirect_uri", sa.String(length=500), nullable=True),
        sa.Column("oidc_scopes", sa.String(length=255), nullable=True),
        sa.Column("saml_entity_id", sa.String(length=500), nullable=True),
        sa.Column("saml_sso_url", sa.String(length=500), nullable=True),
        sa.Column("saml_x509_cert", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    if _has_table("sso_connections"):
        op.drop_table("sso_connections")
