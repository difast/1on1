"""Дедупликация сессий по устройству (Задача 4 из блока исправлений).

Добавляет user_sessions.device_hash — ключ, по которому повторный вход с того же
устройства обновляет существующую сессию, а не создаёт дубль. Аддитивно и
идемпотентно.
"""
revision = "046"
down_revision = "045"

from alembic import op
import sqlalchemy as sa


def _has_col(table: str, col: str) -> bool:
    try:
        return any(c["name"] == col for c in sa.inspect(op.get_bind()).get_columns(table))
    except Exception:
        return False


def upgrade():
    if not _has_col("user_sessions", "device_hash"):
        op.add_column("user_sessions", sa.Column("device_hash", sa.String(length=64), nullable=True))
        op.create_index("ix_user_sessions_device_hash", "user_sessions", ["device_hash"])


def downgrade():
    if _has_col("user_sessions", "device_hash"):
        try:
            op.drop_index("ix_user_sessions_device_hash", table_name="user_sessions")
        except Exception:
            pass
        op.drop_column("user_sessions", "device_hash")
