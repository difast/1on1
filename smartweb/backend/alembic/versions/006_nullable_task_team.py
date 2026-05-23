"""make task team_id nullable

Revision ID: 006
Revises: 005
Create Date: 2026-05-23

"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('tasks', 'team_id', existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.alter_column('tasks', 'team_id', existing_type=sa.Integer(), nullable=False)
