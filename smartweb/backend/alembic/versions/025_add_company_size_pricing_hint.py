"""company size + pricing_hint_shown (мягкая рекомендация тарифа, Этап 5)

Размер компании — чтобы один раз ненавязчиво подсказать подходящий тариф.
pricing_hint_shown — флаг, что подсказка уже показана (повторно не появляется).
"""
revision = '025'
down_revision = '024'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('company_profiles', sa.Column('size', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column(
        'pricing_hint_shown', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'pricing_hint_shown')
    op.drop_column('company_profiles', 'size')
