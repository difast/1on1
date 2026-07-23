"""Настроение и аналитика (блок 12/13/27/31): привязка чек-ина к пользователю
и локальной дате + часовой пояс команды.

Аддитивно: новые nullable-колонки. Существующие записи настроения и команды не
затрагиваются (user_id/local_day = NULL у старых строк, timezone = NULL — тогда
берётся часовой пояс по умолчанию из конфигурации).
"""
from alembic import op
import sqlalchemy as sa

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('mood_entries', sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('mood_entries', sa.Column('local_day', sa.DateTime(), nullable=True))
    op.create_index('ix_mood_entries_user_id', 'mood_entries', ['user_id'])
    op.create_index('ix_mood_entries_local_day', 'mood_entries', ['local_day'])
    op.add_column('teams', sa.Column('timezone', sa.String(64), nullable=True))


def downgrade():
    op.drop_column('teams', 'timezone')
    op.drop_index('ix_mood_entries_local_day', 'mood_entries')
    op.drop_index('ix_mood_entries_user_id', 'mood_entries')
    op.drop_column('mood_entries', 'local_day')
    op.drop_column('mood_entries', 'user_id')
