"""Командные цели: добавляем столбец goals.scope ('personal' | 'team').

Аддитивно и идемпотентно: существующие цели остаются личными (personal).
"""
from alembic import op
import sqlalchemy as sa

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    if 'goals' not in set(insp.get_table_names()):
        return
    cols = {c['name'] for c in insp.get_columns('goals')}
    if 'scope' not in cols:
        op.add_column(
            'goals',
            sa.Column('scope', sa.String(20), server_default='personal', nullable=False),
        )


def downgrade():
    op.drop_column('goals', 'scope')
