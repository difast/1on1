from sqlalchemy import Column, Integer, DateTime, func
from app.database import Base

class MoodEntry(Base):
    __tablename__ = "mood_entries"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, nullable=False)
    score = Column(Integer, nullable=False)  # 1-5
    created_at = Column(DateTime, server_default=func.now())
