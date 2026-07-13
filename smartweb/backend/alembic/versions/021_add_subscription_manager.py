"""subscriptions: dedicated manager name + contact (Enterprise/по назначению)"""
revision = '021'
down_revision = '020'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('subscriptions', sa.Column('manager_name', sa.String(255), nullable=True))
    op.add_column('subscriptions', sa.Column('manager_contact', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('subscriptions', 'manager_contact')
    op.drop_column('subscriptions', 'manager_name')
