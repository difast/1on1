"""Вкладка «Сотрудники» (задача 2): расширяем реестр managers полями сотрудника —
email, роль, зона ответственности, дата изменения.

Аддитивно: новые nullable-колонки (role — с server_default 'manager', поэтому
существующие строки получают корректное значение). Отдельной таблицы/системы не
создаём — используем существующий реестр managers.
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    # Идемпотентно: добавляем только отсутствующие колонки — чтобы миграция могла
    # догнать частично применённую схему и не блокировать цепочку.
    insp = sa.inspect(op.get_bind())
    cols = {c['name'] for c in insp.get_columns('managers')}
    if 'email' not in cols:
        op.add_column('managers', sa.Column('email', sa.String(255), nullable=True))
    if 'role' not in cols:
        op.add_column('managers', sa.Column('role', sa.String(50), nullable=False, server_default='manager'))
    if 'responsibility' not in cols:
        op.add_column('managers', sa.Column('responsibility', sa.Text(), nullable=True))
    if 'updated_at' not in cols:
        op.add_column('managers', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('managers', 'updated_at')
    op.drop_column('managers', 'responsibility')
    op.drop_column('managers', 'role')
    op.drop_column('managers', 'email')
