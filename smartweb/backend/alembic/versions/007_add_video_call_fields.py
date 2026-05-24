"""add jitsi and transcription fields to meetings

Revision ID: 007
Revises: 006
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('meetings', sa.Column('jitsi_room_url', sa.String(500), nullable=True))
    op.add_column('meetings', sa.Column('jitsi_room_name', sa.String(200), nullable=True))
    op.add_column('meetings', sa.Column('call_transcript', sa.Text, nullable=True))
    op.add_column('meetings', sa.Column('ai_summary', sa.Text, nullable=True))


def downgrade():
    op.drop_column('meetings', 'ai_summary')
    op.drop_column('meetings', 'call_transcript')
    op.drop_column('meetings', 'jitsi_room_name')
    op.drop_column('meetings', 'jitsi_room_url')
