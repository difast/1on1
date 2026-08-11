"""Единый журнал аудита (Блок 8).

Одна таблица audit_log на все значимые события: кто (actor_id), что
(action_type), над чем (entity_type/entity_id), в какой организации
(organization_id = team_id), категория, краткое описание, детали (meta, JSON
после редакции), адрес клиента, время. Индексы под фильтры вкладки «Логи».

Аддитивно и идемпотентно: миграции на этом стенде применяются в фоне, поэтому
создание таблицы защищено проверкой существования (повторный прогон безопасен).
"""
revision = "043"
down_revision = "042"

from alembic import op
import sqlalchemy as sa


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def upgrade():
    if _has_table("audit_log"):
        return
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), nullable=True, index=True),
        sa.Column("action_type", sa.String(length=64), nullable=False, index=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True, index=True),
        sa.Column("entity_id", sa.Integer(), nullable=True, index=True),
        sa.Column("organization_id", sa.Integer(), nullable=True, index=True),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="general", index=True),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), index=True),
    )


def downgrade():
    if _has_table("audit_log"):
        op.drop_table("audit_log")
