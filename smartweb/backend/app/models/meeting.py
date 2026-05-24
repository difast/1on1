from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_lead_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scheduled_date = Column(DateTime, nullable=False)
    status = Column(String(20), default="scheduled")  # scheduled, confirmed, rescheduled, cancelled, completed
    mood = Column(String(20), nullable=True)  # great, good, neutral, bad
    notes = Column(Text, nullable=True)
    agenda = Column(Text, nullable=True)
    context_from_last = Column(Text, nullable=True)
    daily_room_url = Column(String(500), nullable=True)
    daily_room_name = Column(String(200), nullable=True)
    call_transcript = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    team = relationship("Team")
    team_lead = relationship("User", foreign_keys=[team_lead_id])
    member = relationship("User", foreign_keys=[member_id])