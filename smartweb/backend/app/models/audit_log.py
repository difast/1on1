"""Единый журнал аудита (Блок 8). ОДНА таблица на все значимые события — не
отдельная таблица под каждый тип. Пишется через переиспользуемый сервис
app/services/audit.py, читается во вкладке «Логи» внутренней админ-панели.

Организация (organization_id) — это team_id из модели изоляции Блока 3.
Категория (category) отделяет обычные бизнес-события от событий безопасности
(security) и административных действий (admin) / входов (auth).
"""
from sqlalchemy import Column, Integer, String, DateTime, JSON, func
from app.database import Base


# Категории записей журнала.
AUDIT_CATEGORIES = ("general", "security", "admin", "auth")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    # Кто совершил действие. NULL — аноним/система (напр. неуспешный вход до
    # идентификации, действие фонового обработчика).
    actor_id = Column(Integer, nullable=True, index=True)
    # Что за действие: короткий машинный код (напр. "task.status_changed").
    action_type = Column(String(64), nullable=False, index=True)
    # Над какой сущностью и её идентификатор (напр. "meeting", 42).
    entity_type = Column(String(64), nullable=True, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    # К какой организации относится (team_id из Блока 3). NULL — вне организации.
    organization_id = Column(Integer, nullable=True, index=True)
    category = Column(String(20), nullable=False, default="general",
                      server_default="general", index=True)
    # Человекочитаемое краткое описание для списка.
    summary = Column(String(500), nullable=True)
    # Детали/дифф значений (до/после) — JSON. ПРОХОДИТ РЕДАКЦИЮ в сервисе:
    # пароли/токены/секреты/платёжные данные сюда попасть не могут.
    meta = Column(JSON, nullable=True)
    # Адрес клиента (для событий безопасности/входа). Не секрет.
    ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
