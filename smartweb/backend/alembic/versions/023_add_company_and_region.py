"""company profiles for workspaces + region/language on users

Этап 3/5/6: реквизиты компании привязаны к рабочему пространству (команде),
detected_region и preferred_language — к пользователю. Все поля необязательные,
ничего не блокируют — данные компании понадобятся позже для оплаты.
"""
revision = '023'
down_revision = '022'

from alembic import op
import sqlalchemy as sa


def upgrade():
    # teams.has_company — быстрый флаг «у пространства есть реквизиты» (Этап 3).
    op.add_column('teams', sa.Column(
        'has_company', sa.Boolean(), nullable=False, server_default='false'))

    # Регион по IP (предполагаемый, не источник истины для провайдера) и язык
    # интерфейса (по браузеру, хранится после ручного выбора) — Этап 5/6.
    op.add_column('users', sa.Column('detected_region', sa.String(2), nullable=True))
    op.add_column('users', sa.Column('preferred_language', sa.String(5), nullable=True))

    # Реквизиты компании рабочего пространства. Структурированные поля + сырой
    # ответ DaData в data (на будущее — для оплаты). team_id уникален: одно
    # пространство = одна компания.
    op.create_table(
        'company_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(),
                  sa.ForeignKey('teams.id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('country', sa.String(2), nullable=False, server_default='RU'),  # RU | KZ
        sa.Column('source', sa.String(20), nullable=True),  # dadata | manual
        sa.Column('name', sa.String(500), nullable=True),
        sa.Column('inn', sa.String(20), nullable=True),      # ИНН (РФ) / БИН (КЗ)
        sa.Column('kpp', sa.String(20), nullable=True),
        sa.Column('ogrn', sa.String(20), nullable=True),     # ОГРН (РФ)
        sa.Column('legal_address', sa.String(1000), nullable=True),
        sa.Column('industry', sa.String(500), nullable=True),  # отрасль / ОКВЭД
        sa.Column('management', sa.String(500), nullable=True),  # руководитель
        sa.Column('status', sa.String(50), nullable=True),   # ACTIVE / LIQUIDATED ...
        sa.Column('data', sa.JSON(), nullable=True),         # полный ответ DaData
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('company_profiles')
    op.drop_column('users', 'preferred_language')
    op.drop_column('users', 'detected_region')
    op.drop_column('teams', 'has_company')
