from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base

# Статусы цели. Осмысленно связаны с прогрессом (правила — в роутере):
#   not_started  — прогресс 0
#   in_progress  — прогресс 1..99
#   at_risk      — в работе, но есть риск не успеть (ставит сотрудник)
#   achieved     — прогресс 100 (нельзя «достигнута» при неполном прогрессе)
#   failed       — период завершён, цель не достигнута
GOAL_STATUSES = ("not_started", "in_progress", "at_risk", "achieved", "failed")
# Открытые статусы — по ним считаем стагнацию/подсказки.
GOAL_OPEN_STATUSES = ("not_started", "in_progress", "at_risk")


class Goal(Base):
    """Персональная цель сотрудника на период (квартал). Принадлежит конкретному
    пользователю; тимлид цель НЕ редактирует (только комментирует/даёт фидбэк —
    проверяется на бэкенде). Прогресс — числовой 0..100 (простая база для v1,
    единый источник истины; ключевые результаты можно нарастить позже)."""
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)   # владелец (сотрудник)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)        # ожидаемый результат
    period_label = Column(String(50), nullable=True)  # напр. "Q3 2026"
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    progress = Column(Integer, nullable=False, default=0, server_default="0")  # 0..100
    status = Column(String(20), nullable=False, default="not_started", server_default="not_started")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    # Когда в последний раз обновляли прогресс — для индикации стагнации у тимлида.
    progress_updated_at = Column(DateTime, server_default=func.now())

    comments = relationship(
        "GoalComment", back_populates="goal",
        cascade="all, delete-orphan", order_by="GoalComment.id",
    )
    owner = relationship("User", foreign_keys=[user_id])


class GoalComment(Base):
    """Тред обсуждения под целью + итоговая обратная связь.

    kind='comment'  — реплика в обсуждении (сотрудник и тимлид, по ходу периода);
    kind='feedback' — структурированный итоговый отзыв тимлида по завершении
                      периода (с опциональной оценкой rating 1..5).
    """
    __tablename__ = "goal_comments"

    id = Column(Integer, primary_key=True)
    goal_id = Column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    kind = Column(String(20), nullable=False, default="comment", server_default="comment")
    rating = Column(Integer, nullable=True)  # только для feedback (1..5)
    created_at = Column(DateTime, server_default=func.now())

    goal = relationship("Goal", back_populates="comments")
    author = relationship("User", foreign_keys=[author_id])
