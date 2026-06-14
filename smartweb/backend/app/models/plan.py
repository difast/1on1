from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, func
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    price_month = Column(Integer, nullable=False, default=0)
    price_year = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RUB")
    per_seat = Column(Boolean, nullable=False, default=False)
    is_enterprise = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    # All limits & feature flags live here so tariffs change without code/deploy.
    limits = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, server_default=func.now())


class UsageCounter(Base):
    __tablename__ = "usage_counters"

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(20), nullable=False, default="team")
    subject_id = Column(Integer, nullable=False)
    metric = Column(String(50), nullable=False)
    period = Column(String(7), nullable=False)  # YYYY-MM
    value = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, server_default=func.now())
