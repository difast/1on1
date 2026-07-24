from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class TaskProposal(Base):
    """Предложение задачи между участниками — ОТДЕЛЬНАЯ сущность и от задачи
    (Task), и от предложения встречи (MeetingProposal). Требует согласия
    получателя: сама задача создаётся только после явного принятия.

    Статусы: pending (ожидает ответа), discussing (обсуждается — идёт обмен
    комментариями), accepted (принято, задача создана), declined (отклонено).

    Обсуждение хранится в истории событий (TaskProposalEvent), чтобы обе стороны
    видели контекст до принятия решения.
    """
    __tablename__ = "task_proposals"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    # Задача, созданная после принятия (если принято).
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    events = relationship(
        "TaskProposalEvent", back_populates="proposal",
        cascade="all, delete-orphan", order_by="TaskProposalEvent.id",
    )
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class TaskProposalEvent(Base):
    """История обсуждения предложения задачи: кто когда предложил/прокомментировал/
    принял/отклонил — обе стороны видят контекст переговоров."""
    __tablename__ = "task_proposal_events"

    id = Column(Integer, primary_key=True)
    proposal_id = Column(Integer, ForeignKey("task_proposals.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)  # proposed, commented, accepted, declined
    note = Column(Text, nullable=True)            # текст комментария (для обсуждения)
    created_at = Column(DateTime, server_default=func.now())

    proposal = relationship("TaskProposal", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])
