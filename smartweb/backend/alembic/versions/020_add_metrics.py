"""metrics: persistent last_active_at + daily metrics snapshots"""
revision = '020'
down_revision = '019'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('users', sa.Column('last_active_at', sa.DateTime(), nullable=True))
    op.create_table(
        'metrics_daily',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False, unique=True),
        sa.Column('dau', sa.Integer(), server_default='0'),
        sa.Column('wau', sa.Integer(), server_default='0'),
        sa.Column('workspaces', sa.Integer(), server_default='0'),
        sa.Column('meetings_total', sa.Integer(), server_default='0'),
        sa.Column('paid_count', sa.Integer(), server_default='0'),
        sa.Column('trialing_count', sa.Integer(), server_default='0'),
        sa.Column('mrr', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('metrics_daily')
    op.drop_column('users', 'last_active_at')
