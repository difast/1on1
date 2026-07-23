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
    op.add_column('managers', sa.Column('email', sa.String(255), nullable=True))
    op.add_column('managers', sa.Column('role', sa.String(50), nullable=False, server_default='manager'))
    op.add_column('managers', sa.Column('responsibility', sa.Text(), nullable=True))
    op.add_column('managers', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('managers', 'updated_at')
    op.drop_column('managers', 'responsibility')
    op.drop_column('managers', 'role')
    op.drop_column('managers', 'email')
