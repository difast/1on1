"""add notes table

Revision ID: 004
Revises: 003
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision: str = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id'), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notes_user_id', 'notes', ['user_id'])


def downgrade():
    op.drop_index('ix_notes_user_id', table_name='notes')
    op.drop_table('notes')
