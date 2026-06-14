"""billing: subscriptions, payments, invoices + full-access override on users"""
revision = '019'
down_revision = '018'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('subject_type', sa.String(20), nullable=False, server_default='user'),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('plan_code', sa.String(50), nullable=False),
        # free / trialing / active / past_due / blocked / canceled
        sa.Column('status', sa.String(20), nullable=False, server_default='free'),
        sa.Column('seats', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('billing_period', sa.String(10), nullable=False, server_default='month'),  # month/year
        sa.Column('provider', sa.String(30), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True),
        sa.Column('trial_end', sa.DateTime(), nullable=True),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_sub_subject', 'subscriptions', ['subject_type', 'subject_id'])

    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('subject_type', sa.String(20), nullable=True),
        sa.Column('subject_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(10), nullable=False, server_default='RUB'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('provider', sa.String(30), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True),
        sa.Column('idempotency_key', sa.String(255), nullable=True, unique=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'invoices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('subject_type', sa.String(20), nullable=False, server_default='user'),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('number', sa.String(50), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(10), nullable=False, server_default='RUB'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('plan_code', sa.String(50), nullable=True),
        sa.Column('file_url', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Full-access override (grant complete rights without a subscription).
    op.add_column('users', sa.Column('billing_override', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('billing_override_note', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('billing_override_by', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('billing_override_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('users', 'billing_override_at')
    op.drop_column('users', 'billing_override_by')
    op.drop_column('users', 'billing_override_note')
    op.drop_column('users', 'billing_override')
    op.drop_table('invoices')
    op.drop_table('payments')
    op.drop_index('ix_sub_subject', table_name='subscriptions')
    op.drop_table('subscriptions')
