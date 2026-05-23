"""add push_token to users

Revision ID: 003
Revises: 002
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('push_token', sa.String(512), nullable=True))


def downgrade():
    op.drop_column('users', 'push_token')
