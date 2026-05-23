"""add task status

Revision ID: 005
Revises: 004
Create Date: 2026-05-23

"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column(
        'status', sa.String(20), nullable=False, server_default='in_progress'
    ))


def downgrade():
    op.drop_column('tasks', 'status')
