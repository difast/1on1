from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, func
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.encrypted_type import EncryptedText

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_lead_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scheduled_date = Column(DateTime, nullable=False)
    status = Column(String(20), default="scheduled")  # scheduled, confirmed, rescheduled, cancelled, completed
    # Групповой созвон (Задача 4): несколько встреч, созданных вместе, делят один
    # group_id (по строке на участника). У обычных 1-на-1 это NULL — формат 1-на-1
    # продолжает работать без изменений.
    group_id = Column(String(64), nullable=True, index=True)
    mood = Column(String(20), nullable=True)  # great, good, neutral, bad
    # Шифруются в состоянии покоя (Блок 9): приватные заметки 1-на-1, расшифровка
    # разговора и AI-резюме — самое чувствительное свободное содержимое встречи.
    # Читаются поштучно, по содержимому не фильтруются — шифрование оправдано.
    notes = Column(EncryptedText, nullable=True)
    agenda = Column(Text, nullable=True)
    context_from_last = Column(Text, nullable=True)
    jitsi_room_url = Column(String(500), nullable=True)
    jitsi_room_name = Column(String(200), nullable=True)
    call_transcript = Column(EncryptedText, nullable=True)
    ai_summary = Column(EncryptedText, nullable=True)
    call_duration_seconds = Column(Integer, nullable=True)
    call_analytics = Column(Text, nullable=True)  # JSON
    is_rescheduled = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    team = relationship("Team")
    team_lead = relationship("User", foreign_keys=[team_lead_id])
    member = relationship("User", foreign_keys=[member_id])
