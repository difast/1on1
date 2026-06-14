"""billing: plans catalog + usage counters"""
revision = '018'
down_revision = '017'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.create_table(
        'plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(50), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('price_month', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('price_year', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(10), nullable=False, server_default='RUB'),
        sa.Column('per_seat', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_enterprise', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        # limits + feature flags as JSON so tariffs can change without code/deploy
        sa.Column('limits', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'usage_counters',
        sa.Column('id', sa.Integer(), primary_key=True),
        # subject = the billed entity (team id for B2B, or user id as fallback)
        sa.Column('subject_type', sa.String(20), nullable=False, server_default='team'),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('metric', sa.String(50), nullable=False),
        sa.Column('period', sa.String(7), nullable=False),  # YYYY-MM
        sa.Column('value', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        'ix_usage_subject_metric_period',
        'usage_counters',
        ['subject_type', 'subject_id', 'metric', 'period'],
        unique=True,
    )


def downgrade():
    op.drop_index('ix_usage_subject_metric_period', table_name='usage_counters')
    op.drop_table('usage_counters')
    op.drop_table('plans')
