"""Новая тарифная сетка: Start / Team / Business / Enterprise.

Каталог тарифов пересобирается кодом (app.services.plans.seed_plans по
CATALOG_VERSION), поэтому здесь только данные, которые seed трогать не должен:
  - подписки на снятый тариф «Компания» (company) переводятся на business;
  - строка плана company деактивируется (её могут держать старые платежи).

Downgrade возвращает подписки обратно на company — по коду плана; суммы и
состав функций восстановятся при откате кода (CATALOG_VERSION вернётся к 1).
"""
revision = '038'
down_revision = '037'

from alembic import op
import sqlalchemy as sa


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE subscriptions SET plan_code = 'business' WHERE plan_code = 'company'"))
    conn.execute(sa.text("UPDATE plans SET is_active = false WHERE code = 'company'"))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE plans SET is_active = true WHERE code = 'company'"))
    conn.execute(sa.text("UPDATE subscriptions SET plan_code = 'company' WHERE plan_code = 'business'"))
