from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class TaskActivity(Base):
    """Лента активности задачи (39.2/39.3): кто что изменил и когда. Логируем
    создание, смену статуса, добавление/удаление исполнителей, комментарии."""
    __tablename__ = "task_activities"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(30), nullable=False)  # created|status_changed|assignee_added|assignee_removed|commented|collab_joined
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    actor = relationship("User", foreign_keys=[actor_id])


class TaskComment(Base):
    """Комментарии по задаче (39.2). Структурная запись, привязанная к задаче,
    не переписка в реальном времени."""
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    author = relationship("User", foreign_keys=[author_id])
