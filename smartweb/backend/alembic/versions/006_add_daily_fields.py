"""add daily.co fields to meetings

Revision ID: 006
Revises: 005
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('meetings', sa.Column('daily_room_url', sa.String(500), nullable=True))
    op.add_column('meetings', sa.Column('daily_room_name', sa.String(200), nullable=True))
    op.add_column('meetings', sa.Column('call_transcript', sa.Text, nullable=True))


def downgrade():
    op.drop_column('meetings', 'call_transcript')
    op.drop_column('meetings', 'daily_room_name')
    op.drop_column('meetings', 'daily_room_url')
