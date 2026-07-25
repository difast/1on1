from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import relationship
from app.database import Base


class TaskAssignee(Base):
    """Одно назначение внутри задачи: участник + его часть работы + свой статус.

    Совместная задача (Задача 4) — это ОДНА запись Task с несколькими
    TaskAssignee. Для обратной совместимости задачи с одним ответственным
    продолжают работать через Task.assigned_to; строки task_assignees для них
    не обязательны. Модель аддитивна и не ломает существующие задачи.
    """
    __tablename__ = "task_assignees"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    part_description = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="in_progress", server_default="in_progress")
    completed = Column(Boolean, default=False, nullable=False, server_default="false")
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    task = relationship("Task", back_populates="assignees")
    user = relationship("User", foreign_keys=[user_id])
