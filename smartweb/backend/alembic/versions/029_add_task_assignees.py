"""Совместные задачи: таблица task_assignees (Задача 4).

Аддитивная миграция — только новая таблица. Существующие задачи (tasks) и их
структура не меняются: задачи с одним ответственным продолжают работать через
tasks.assigned_to, строки task_assignees для них не создаются.
"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'task_assignees',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('part_description', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), server_default='in_progress', nullable=False),
        sa.Column('completed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_task_assignees_task_id', 'task_assignees', ['task_id'])
    op.create_index('ix_task_assignees_user_id', 'task_assignees', ['user_id'])


def downgrade():
    op.drop_index('ix_task_assignees_user_id', 'task_assignees')
    op.drop_index('ix_task_assignees_task_id', 'task_assignees')
    op.drop_table('task_assignees')
