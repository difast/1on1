from sqlalchemy import Column, Integer, String, DateTime, func
from app.database import Base


class Manager(Base):
    """Реестр выделенных менеджеров: заводятся вручную в админ-панели и
    назначаются пользователям из списка."""
    __tablename__ = "managers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    contact = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
