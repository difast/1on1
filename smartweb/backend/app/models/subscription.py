from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text, func
from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(20), nullable=False, default="user")
    subject_id = Column(Integer, nullable=False)
    plan_code = Column(String(50), nullable=False)
    # free / trialing / active / past_due / blocked / canceled
    status = Column(String(20), nullable=False, default="free")
    seats = Column(Integer, nullable=False, default=1)
    billing_period = Column(String(10), nullable=False, default="month")
    provider = Column(String(30), nullable=True)
    external_id = Column(String(255), nullable=True)
    trial_end = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, nullable=True)
    subject_type = Column(String(20), nullable=True)
    subject_id = Column(Integer, nullable=True)
    amount = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RUB")
    status = Column(String(20), nullable=False, default="pending")
    provider = Column(String(30), nullable=True)
    external_id = Column(String(255), nullable=True)
    idempotency_key = Column(String(255), nullable=True, unique=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(20), nullable=False, default="user")
    subject_id = Column(Integer, nullable=False)
    number = Column(String(50), nullable=True)
    amount = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RUB")
    status = Column(String(20), nullable=False, default="draft")
    plan_code = Column(String(50), nullable=True)
    file_url = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
