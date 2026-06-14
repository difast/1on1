from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    role = Column(String(50), default="member")
    title = Column(String(255), nullable=True)
    telegram = Column(String(100), nullable=True)
    linkedin = Column(String(255), nullable=True)
    github = Column(String(255), nullable=True)
    calendar_token = Column(Text, nullable=True)
    avatar = Column(Text, nullable=True)
    push_token = Column(String(512), nullable=True)
    is_blocked = Column(Boolean, nullable=False, default=False, server_default='false')
    # Full-access override: grants complete rights without any subscription.
    billing_override = Column(Boolean, nullable=False, default=False, server_default='false')
    billing_override_note = Column(Text, nullable=True)
    billing_override_by = Column(Integer, nullable=True)
    billing_override_at = Column(DateTime, nullable=True)
    last_active_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
