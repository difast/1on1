"""add call analytics fields

Revision ID: 008
Revises: 007
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('meetings', sa.Column('call_duration_seconds', sa.Integer, nullable=True))
    op.add_column('meetings', sa.Column('call_analytics', sa.Text, nullable=True))


def downgrade():
    op.drop_column('meetings', 'call_analytics')
    op.drop_column('meetings', 'call_duration_seconds')
