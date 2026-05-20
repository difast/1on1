"""add avatar to users

Revision ID: 002
Revises: 001
Create Date: 2026-05-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision: str = '002'
down_revision = '001'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users', sa.Column('avatar', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('users', 'avatar')
