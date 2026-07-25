from sqlalchemy import Column, Integer, DateTime, Text, ForeignKey, func
from app.database import Base

class MoodEntry(Base):
    __tablename__ = "mood_entries"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, nullable=False)
    # Привязка к пользователю (блок 12): нужна для личного графика (27.1),
    # дедупликации за день (12.1) и подсчёта ДОЛИ заполнивших (13.3). Nullable —
    # старые записи без автора остаются валидными (обратная совместимость).
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    score = Column(Integer, nullable=False)  # 1-5
    survey_text = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    # Локальная дата заполнения (в часовом поясе команды) — для дедупа за день и
    # корректной группировки по суткам независимо от пояса сервера.
    local_day = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
