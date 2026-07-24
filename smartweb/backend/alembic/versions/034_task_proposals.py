"""Предложение задачи между участниками (с подтверждением) — отдельная сущность
от задачи и от предложения встречи.

Аддитивно: новые таблицы task_proposals и task_proposal_events. Существующие
задачи и предложения встреч не затрагиваются.
"""
from alembic import op
import sqlalchemy as sa

revision = '034'
down_revision = '033'
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    existing = set(insp.get_table_names())

    if 'task_proposals' not in existing:
        op.create_table(
            'task_proposals',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
            sa.Column('from_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('to_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('due_date', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), server_default='pending', nullable=False),
            sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_task_proposals_from_user_id', 'task_proposals', ['from_user_id'])
        op.create_index('ix_task_proposals_to_user_id', 'task_proposals', ['to_user_id'])

    if 'task_proposal_events' not in existing:
        op.create_table(
            'task_proposal_events',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('proposal_id', sa.Integer(), sa.ForeignKey('task_proposals.id', ondelete='CASCADE'), nullable=False),
            sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('action', sa.String(20), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_task_proposal_events_proposal_id', 'task_proposal_events', ['proposal_id'])


def downgrade():
    op.drop_index('ix_task_proposal_events_proposal_id', 'task_proposal_events')
    op.drop_table('task_proposal_events')
    op.drop_index('ix_task_proposals_to_user_id', 'task_proposals')
    op.drop_index('ix_task_proposals_from_user_id', 'task_proposals')
    op.drop_table('task_proposals')
