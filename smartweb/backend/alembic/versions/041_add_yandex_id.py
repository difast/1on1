"""users.yandex_id — вход через Yandex ID

Стабильный идентификатор провайдера (уникальный, nullable — привязка есть не у
всех). Матчинг пользователя при входе идёт по нему, а не по email: email в
Яндексе можно сменить, и сопоставление только по почте позволило бы угнать
чужой аккаунт.
"""
revision = "041"
down_revision = "040"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("users", sa.Column("yandex_id", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_users_yandex_id", "users", ["yandex_id"])


def downgrade():
    op.drop_constraint("uq_users_yandex_id", "users", type_="unique")
    op.drop_column("users", "yandex_id")
