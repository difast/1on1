from sqlalchemy import Column, Integer, ForeignKey, DateTime, Date, func
from app.database import Base

class WorkCheckin(Base):
    __tablename__ = "work_checkins"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    arrived_at = Column(DateTime)
    left_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
