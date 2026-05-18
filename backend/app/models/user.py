from sqlalchemy import Column, Integer, String, DateTime, Text, func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    role = Column(String(50), default="member")  # "team_lead" or "member"
    title = Column(String(255), nullable=True)
    telegram = Column(String(100), nullable=True)
    linkedin = Column(String(255), nullable=True)
    github = Column(String(255), nullable=True)
    calendar_token = Column(Text, nullable=True)
    avatar = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())