"""telegram_bot_state — состояние пошаговых диалогов бота (Этап 3, /newmeeting)"""
revision = '026'
down_revision = '025'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.create_table(
        'telegram_bot_state',
        sa.Column('telegram_id', sa.BigInteger(), primary_key=True),
        sa.Column('flow', sa.String(30), nullable=True),
        sa.Column('step', sa.String(30), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('telegram_bot_state')
