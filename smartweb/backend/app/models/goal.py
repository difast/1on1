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

# Тип цели:
#   personal — личная цель сотрудника (владелец = сотрудник, редактирует он сам);
#   team     — командная цель (владелец = тимлид, ставит и ведёт прогресс он,
#              видит вся команда, участники могут комментировать).
GOAL_SCOPES = ("personal", "team")


class Goal(Base):
    """Цель на период (квартал). Та же логика для личной и командной цели:
    числовой прогресс 0..100, те же статусы и правила их связки, обсуждение и
    подсказки. Разница — во владельце и правах (см. scope), что проверяется на
    бэкенде:
      personal — принадлежит сотруднику, редактирует только он; тимлид
                 комментирует/даёт фидбэк, но не меняет прогресс;
      team     — принадлежит тимлиду (user_id = тимлид), редактирует только он;
                 видна всей команде, участники могут комментировать."""
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True)
    # Владелец, который ведёт прогресс: сотрудник (personal) или тимлид (team).
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    scope = Column(String(20), nullable=False, default="personal", server_default="personal")
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
