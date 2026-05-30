from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, JSON, func
from sqlalchemy.orm import relationship
from app.database import Base

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(50), nullable=False)  # meeting_reminder, meeting_request, task_assigned, burnout_alert
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    data = Column(JSON, nullable=True)  # extra payload like meeting_id
    read = Column(Boolean, default=False)
    is_broadcast = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")