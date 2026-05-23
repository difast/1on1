from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, func
from app.database import Base


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
