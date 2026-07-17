"""users.onboarding_tour_done — общий для аккаунта флаг прохождения онбординг-гида

Раньше факт прохождения тура хранился только в localStorage (привязан к браузеру),
поэтому пользователь, прошедший гид на вебе, видел его заново в Telegram Mini App
(другое хранилище). Флаг в профиле делает его общим для всех платформ.
"""
revision = '027'
down_revision = '026'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('users', sa.Column(
        'onboarding_tour_done', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'onboarding_tour_done')
