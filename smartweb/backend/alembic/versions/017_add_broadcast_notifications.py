"""add broadcast to notifications"""
revision = '017'
down_revision = '016'

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('notifications', sa.Column('is_broadcast', sa.Boolean(), nullable=False, server_default='false'))

def downgrade():
    op.drop_column('notifications', 'is_broadcast')
