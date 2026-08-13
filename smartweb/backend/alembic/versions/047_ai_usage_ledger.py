"""Этап 2/4: журнал AI-себестоимости и поля подписки (AI-бюджет override,
отложенный даунгрейд).

Аддитивно и идемпотентно (миграции идут в фоне): добавление таблицы/колонок с
проверкой существования, повторный прогон безопасен.
"""
revision = "047"
down_revision = "046"

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
    if not _has_table("ai_usage_ledger"):
        op.create_table(
            "ai_usage_ledger",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_user_id", sa.Integer(), nullable=False, index=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=True, index=True),
            sa.Column("team_id", sa.Integer(), nullable=True, index=True),
            sa.Column("feature", sa.String(length=40), nullable=False, server_default="other"),
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("input_cost_micro", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("output_cost_micro", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("model", sa.String(length=80), nullable=True),
            sa.Column("degraded", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("period", sa.String(length=7), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_ai_usage_owner_period", "ai_usage_ledger",
                        ["owner_user_id", "period"])
        op.create_index("ix_ai_usage_ledger_feature", "ai_usage_ledger", ["feature"])
        op.create_index("ix_ai_usage_ledger_period", "ai_usage_ledger", ["period"])

    for col, coltype in (
        ("ai_budget_rub_override", sa.Integer()),
        ("pending_plan_code", sa.String(length=50)),
        ("pending_period", sa.String(length=10)),
    ):
        if not _has_col("subscriptions", col):
            op.add_column("subscriptions", sa.Column(col, coltype, nullable=True))


def downgrade():
    for col in ("ai_budget_rub_override", "pending_plan_code", "pending_period"):
        if _has_col("subscriptions", col):
            op.drop_column("subscriptions", col)
    if _has_table("ai_usage_ledger"):
        op.drop_table("ai_usage_ledger")
