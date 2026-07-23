from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base

# Единая сущность «Взаимодействие» (блок 39). Все социальные взаимодействия в
# команде — структурные записи со статусом и жизненным циклом, НЕ чат.
#
# type:
#   collab_proposal  — предложение совместной работы над задачей (39.1)
#   help_offer       — предложение помощи (39.4)
#   consultation     — запрос консультации (39.5)
#   discussion       — инициация обсуждения (39.6)
#   recommendation   — рекомендация участника (39.7)
#
# status: sent | accepted | declined | completed | closed
INTERACTION_TYPES = ("collab_proposal", "help_offer", "consultation", "discussion", "recommendation")


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True)
    type = Column(String(30), nullable=False)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Основной получатель (для 1:1 типов). У обсуждения получателей несколько —
    # см. interaction_participants.
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Для рекомендации: кого рекомендуют (эксперт).
    subject_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True)

    topic = Column(String(300), nullable=True)
    context = Column(Text, nullable=True)
    desired_format = Column(String(20), nullable=True)  # consultation: text | call
    status = Column(String(20), nullable=False, default="sent", server_default="sent")
    outcome = Column(String(20), nullable=True)  # discussion: decision | needs_meeting | closed
    expires_at = Column(DateTime, nullable=True)  # срок жизни (напр. предложения)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])
    subject_user = relationship("User", foreign_keys=[subject_user_id])
    participants = relationship("InteractionParticipant", back_populates="interaction",
                                cascade="all, delete-orphan", order_by="InteractionParticipant.id")
    replies = relationship("InteractionReply", back_populates="interaction",
                           cascade="all, delete-orphan", order_by="InteractionReply.id")


class InteractionParticipant(Base):
    """Участники обсуждения (39.6) — несколько приглашённых на одно взаимодействие."""
    __tablename__ = "interaction_participants"

    id = Column(Integer, primary_key=True)
    interaction_id = Column(Integer, ForeignKey("interactions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False, default="participant")  # initiator | participant
    created_at = Column(DateTime, server_default=func.now())

    interaction = relationship("Interaction", back_populates="participants")
    user = relationship("User", foreign_keys=[user_id])


class InteractionReply(Base):
    """Структурный тред реплик обсуждения/ответа консультации. НЕ мессенджер:
    конечный список реплик с автором и текстом, без онлайн-статусов и реакций."""
    __tablename__ = "interaction_replies"

    id = Column(Integer, primary_key=True)
    interaction_id = Column(Integer, ForeignKey("interactions.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    interaction = relationship("Interaction", back_populates="replies")
    author = relationship("User", foreign_keys=[author_id])
