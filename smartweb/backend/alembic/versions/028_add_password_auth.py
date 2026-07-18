"""Собственная аутентификация: пароль + подтверждение email + одноразовые токены

Добавляет:
  users.password_hash   — bcrypt-хэш пароля (nullable: у Telegram-only нет пароля)
  users.email_confirmed — подтверждён ли email (мягкая логика, не блокирует доступ)
  auth_tokens           — одноразовые токены подтверждения email и сброса пароля

Замена внешней аутентификации (Supabase) на собственную. Схему создаёт с нуля
на новой базе; на существующей базе просто добавляет поля/таблицу.
"""
revision = '028'
down_revision = '027'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('users', sa.Column('password_hash', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column(
        'email_confirmed', sa.Boolean(), nullable=False, server_default='false'))

    op.create_table(
        'auth_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(length=128), nullable=False),
        sa.Column('purpose', sa.String(length=20), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_auth_tokens_user_id', 'auth_tokens', ['user_id'])
    op.create_index('ix_auth_tokens_token', 'auth_tokens', ['token'], unique=True)


def downgrade():
    op.drop_index('ix_auth_tokens_token', table_name='auth_tokens')
    op.drop_index('ix_auth_tokens_user_id', table_name='auth_tokens')
    op.drop_table('auth_tokens')
    op.drop_column('users', 'email_confirmed')
    op.drop_column('users', 'password_hash')
