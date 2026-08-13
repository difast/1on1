"""Журнал AI-себестоимости — по одной записи на AI-запрос.

Здесь фиксируется фактическая стоимость каждого обращения к модели (Пит, ONE AI,
декомпозиция задач и т.д.) в токенах и в рублях. Система provider-agnostic:
стоимость считается по ценам за токен из конфигурации (services/ai_billing.py),
поэтому смена модели/провайдера не требует изменения схемы или логики учёта.

Деньги храним в МИКРОрублях (целое, 1e-6 ₽), чтобы не терять копейки на дробях:
один запрос может стоить доли копейки, а агрегаты складываются точно.
"""
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Index, func

from app.database import Base


class AiUsageLedger(Base):
    __tablename__ = "ai_usage_ledger"

    id = Column(Integer, primary_key=True)
    # Владелец бюджета — субъект тарифа (обычно тимлид/организация), на чей
    # AI-бюджет относится расход. По нему считаем «использовано из лимита».
    owner_user_id = Column(Integer, nullable=False, index=True)
    # Кто фактически сделал запрос (для разбивки по пользователям команды).
    actor_user_id = Column(Integer, nullable=True, index=True)
    team_id = Column(Integer, nullable=True, index=True)
    # Функция: pit | one_ai | task_decomposition | meeting_slots | mood | development | other
    feature = Column(String(40), nullable=False, default="other", index=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    # Стоимость в микрорублях (1e-6 ₽): раздельно input/output для разбивки.
    input_cost_micro = Column(BigInteger, nullable=False, default=0)
    output_cost_micro = Column(BigInteger, nullable=False, default=0)
    # Провенанс: какая модель посчитана (на случай смены модели в середине месяца).
    model = Column(String(80), nullable=True)
    degraded = Column(Integer, nullable=False, default=0)  # 1, если ответ в урезанном режиме
    # Расчётный период вида YYYY-MM — по нему считаем месячный расход и сброс лимита.
    period = Column(String(7), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


Index("ix_ai_usage_owner_period", AiUsageLedger.owner_user_id, AiUsageLedger.period)
