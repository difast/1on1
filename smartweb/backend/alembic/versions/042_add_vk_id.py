"""users.vk_id — вход через VK ID

Стабильный идентификатор провайдера (уникальный, nullable — привязка есть не у
всех). Матчинг пользователя при входе идёт по нему, а не по email: email во VK
можно сменить или скрыть, и сопоставление только по почте позволило бы угнать
чужой аккаунт (та же логика, что для yandex_id в миграции 041).
"""
revision = "042"
down_revision = "041"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("users", sa.Column("vk_id", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_users_vk_id", "users", ["vk_id"])


def downgrade():
    op.drop_constraint("uq_users_vk_id", "users", type_="unique")
    op.drop_column("users", "vk_id")
