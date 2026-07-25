"""Блок 39: командные взаимодействия + лента активности/комментарии задач.

Аддитивно: только новые таблицы. Существующие задачи/встречи/назначения не
затрагиваются, поведение прежних функций не меняется.
"""
from alembic import op
import sqlalchemy as sa

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'interactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('from_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('to_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('subject_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id', ondelete='SET NULL'), nullable=True),
        sa.Column('topic', sa.String(300), nullable=True),
        sa.Column('context', sa.Text(), nullable=True),
        sa.Column('desired_format', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), server_default='sent', nullable=False),
        sa.Column('outcome', sa.String(20), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_interactions_from_user_id', 'interactions', ['from_user_id'])
    op.create_index('ix_interactions_to_user_id', 'interactions', ['to_user_id'])
    op.create_index('ix_interactions_subject_user_id', 'interactions', ['subject_user_id'])

    op.create_table(
        'interaction_participants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('interaction_id', sa.Integer(), sa.ForeignKey('interactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.String(20), server_default='participant', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_interaction_participants_interaction_id', 'interaction_participants', ['interaction_id'])
    op.create_index('ix_interaction_participants_user_id', 'interaction_participants', ['user_id'])

    op.create_table(
        'interaction_replies',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('interaction_id', sa.Integer(), sa.ForeignKey('interactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_interaction_replies_interaction_id', 'interaction_replies', ['interaction_id'])

    op.create_table(
        'task_activities',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(30), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_task_activities_task_id', 'task_activities', ['task_id'])

    op.create_table(
        'task_comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_task_comments_task_id', 'task_comments', ['task_id'])


def downgrade():
    op.drop_table('task_comments')
    op.drop_table('task_activities')
    op.drop_table('interaction_replies')
    op.drop_table('interaction_participants')
    op.drop_index('ix_interactions_subject_user_id', 'interactions')
    op.drop_index('ix_interactions_to_user_id', 'interactions')
    op.drop_index('ix_interactions_from_user_id', 'interactions')
    op.drop_table('interactions')
