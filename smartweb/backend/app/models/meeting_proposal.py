from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class MeetingProposal(Base):
    """Предложение встречи между участниками (Задача 5) — ОТДЕЛЬНАЯ сущность от
    встречи. Требует согласия получателя; сама встреча (Meeting) создаётся только
    после явного принятия. Поддерживает цикл переговоров о времени (встречные
    предложения) через историю событий.

    Статусы: pending (ожидает ответа), accepted (принято), declined (отклонено).
    «Предложено другое время» — это новый раунд pending: proposed_time обновляется,
    awaiting_user_id переходит к другой стороне, а факт встречного предложения
    фиксируется событием 'countered' в истории.
    """
    __tablename__ = "meeting_proposals"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    topic = Column(String(500), nullable=True)
    proposed_time = Column(DateTime, nullable=False)  # текущее время «на столе»
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    # Чьего ответа ждём сейчас (получатель текущего предложения).
    awaiting_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Кто предложил текущее время.
    last_actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Встреча, созданная после принятия (если принято).
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    events = relationship(
        "MeetingProposalEvent", back_populates="proposal",
        cascade="all, delete-orphan", order_by="MeetingProposalEvent.id",
    )
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class MeetingProposalEvent(Base):
    """История переговоров по предложению (Задача 5): кто когда что предложил/
    принял/отклонил — чтобы обе стороны видели контекст при нескольких раундах."""
    __tablename__ = "meeting_proposal_events"

    id = Column(Integer, primary_key=True)
    proposal_id = Column(Integer, ForeignKey("meeting_proposals.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)  # proposed, countered, accepted, declined
    proposed_time = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    proposal = relationship("MeetingProposal", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])
