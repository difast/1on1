"""managers registry + subscriptions.manager_id (назначение из списка)"""
revision = '022'
down_revision = '021'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.create_table(
        'managers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('contact', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.add_column('subscriptions', sa.Column('manager_id', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('subscriptions', 'manager_id')
    op.drop_table('managers')
