"""Блок 1: усиление входа — сессии, известные устройства, резервные коды 2FA,
поля TOTP на users.

Аддитивно и идемпотентно (миграции идут в фоне): добавление колонок и таблиц с
проверкой существования, повторный прогон безопасен.
"""
revision = "044"
down_revision = "043"

from alembic import op
import sqlalchemy as sa


def _insp():
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return _insp().has_table(name)


def _has_col(table: str, col: str) -> bool:
    try:
        return any(c["name"] == col for c in _insp().get_columns(table))
    except Exception:
        return False


def upgrade():
    if not _has_col("users", "totp_secret_enc"):
        op.add_column("users", sa.Column("totp_secret_enc", sa.Text(), nullable=True))
    if not _has_col("users", "totp_enabled"):
        op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))

    if not _has_table("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("jti", sa.String(length=64), nullable=False, unique=True, index=True),
            sa.Column("device_label", sa.String(length=255), nullable=True),
            sa.Column("ip", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("last_active_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )

    if not _has_table("user_devices"):
        op.create_table(
            "user_devices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("device_hash", sa.String(length=64), nullable=False, index=True),
            sa.Column("label", sa.String(length=255), nullable=True),
            sa.Column("ip", sa.String(length=64), nullable=True),
            sa.Column("trusted", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(), server_default=sa.func.now()),
        )

    if not _has_table("totp_backup_codes"):
        op.create_table(
            "totp_backup_codes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("code_hash", sa.String(length=128), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade():
    for t in ("totp_backup_codes", "user_devices", "user_sessions"):
        if _has_table(t):
            op.drop_table(t)
    for c in ("totp_enabled", "totp_secret_enc"):
        if _has_col("users", c):
            op.drop_column("users", c)
