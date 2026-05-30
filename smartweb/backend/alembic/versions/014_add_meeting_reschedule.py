from alembic import op
import sqlalchemy as sa

revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('meetings', sa.Column('is_rescheduled', sa.Boolean(), nullable=False, server_default='false'))

def downgrade():
    op.drop_column('meetings', 'is_rescheduled')
