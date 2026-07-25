"""Модуль «Цели»: персональные цели сотрудника на период + тред обсуждения и
итоговая обратная связь тимлида.

Аддитивно: новые таблицы goals и goal_comments. Существующие данные не
затрагиваются.
"""
from alembic import op
import sqlalchemy as sa

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    existing = set(insp.get_table_names())

    if 'goals' not in existing:
        op.create_table(
            'goals',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('period_label', sa.String(50), nullable=True),
            sa.Column('period_start', sa.DateTime(), nullable=True),
            sa.Column('period_end', sa.DateTime(), nullable=True),
            sa.Column('progress', sa.Integer(), server_default='0', nullable=False),
            sa.Column('status', sa.String(20), server_default='not_started', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('progress_updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_goals_user_id', 'goals', ['user_id'])

    if 'goal_comments' not in existing:
        op.create_table(
            'goal_comments',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
            sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('kind', sa.String(20), server_default='comment', nullable=False),
            sa.Column('rating', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_goal_comments_goal_id', 'goal_comments', ['goal_id'])


def downgrade():
    op.drop_index('ix_goal_comments_goal_id', 'goal_comments')
    op.drop_table('goal_comments')
    op.drop_index('ix_goals_user_id', 'goals')
    op.drop_table('goals')
