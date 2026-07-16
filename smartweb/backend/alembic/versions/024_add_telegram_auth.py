"""telegram auth: users.telegram_id + telegram_link_requests

Единый идентификатор Telegram на пользователе (уникальный, nullable — не у всех
есть привязка) + таблица кодов подтверждения для связывания существующего
email-аккаунта с Telegram (защита от дублей, Этап 4).
"""
revision = '024'
down_revision = '023'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('users', sa.Column('telegram_id', sa.BigInteger(), nullable=True))
    op.create_unique_constraint('uq_users_telegram_id', 'users', ['telegram_id'])
    # У пользователей, вошедших только через Telegram, email может отсутствовать.
    # Уникальность сохраняется (Postgres допускает несколько NULL).
    op.alter_column('users', 'email', existing_type=sa.String(255), nullable=True)

    op.create_table(
        'telegram_link_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(12), nullable=False, unique=True),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('first_name', sa.String(255), nullable=True),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('photo_url', sa.String(1000), nullable=True),
        sa.Column('consumed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_tg_link_code', 'telegram_link_requests', ['code'])


def downgrade():
    op.alter_column('users', 'email', existing_type=sa.String(255), nullable=False)
    op.drop_index('ix_tg_link_code', table_name='telegram_link_requests')
    op.drop_table('telegram_link_requests')
    op.drop_constraint('uq_users_telegram_id', 'users', type_='unique')
    op.drop_column('users', 'telegram_id')
