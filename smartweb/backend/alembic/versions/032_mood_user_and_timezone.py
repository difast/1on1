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


def _cols(insp, table):
    return {c['name'] for c in insp.get_columns(table)}


def _indexes(insp, table):
    return {i['name'] for i in insp.get_indexes(table)}


def upgrade():
    # Идемпотентно: пропускаем то, что уже есть — чтобы миграция могла «догнать»
    # частично применённую схему, а не падать на «column already exists» и не
    # блокировать всю цепочку (иначе новые колонки не появляются и админ-панель
    # получает «Ошибка загрузки»).
    insp = sa.inspect(op.get_bind())
    me = _cols(insp, 'mood_entries')
    if 'user_id' not in me:
        op.add_column('mood_entries', sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    if 'local_day' not in me:
        op.add_column('mood_entries', sa.Column('local_day', sa.DateTime(), nullable=True))
    me_idx = _indexes(insp, 'mood_entries')
    if 'ix_mood_entries_user_id' not in me_idx:
        op.create_index('ix_mood_entries_user_id', 'mood_entries', ['user_id'])
    if 'ix_mood_entries_local_day' not in me_idx:
        op.create_index('ix_mood_entries_local_day', 'mood_entries', ['local_day'])
    if 'timezone' not in _cols(insp, 'teams'):
        op.add_column('teams', sa.Column('timezone', sa.String(64), nullable=True))


def downgrade():
    op.drop_column('teams', 'timezone')
    op.drop_index('ix_mood_entries_local_day', 'mood_entries')
    op.drop_index('ix_mood_entries_user_id', 'mood_entries')
    op.drop_column('mood_entries', 'local_day')
    op.drop_column('mood_entries', 'user_id')
