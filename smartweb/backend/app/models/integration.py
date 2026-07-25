"""Модели интеграций: подключения календарей, связи событий и исходящие вебхуки.

Токены календарей хранятся ТОЛЬКО в зашифрованном виде (см. crypto.py) — колонки
access_token_enc/refresh_token_enc содержат base64 шифртекста, не сам токен.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, Boolean, JSON, ForeignKey, func, UniqueConstraint
)
from app.database import Base


class CalendarIntegration(Base):
    """OAuth-подключение календаря пользователя (один провайдер на пользователя)."""
    __tablename__ = "calendar_integrations"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_calendar_user_provider"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)          # "google" | "yandex"
    access_token_enc = Column(Text, nullable=True)         # зашифрованный access token
    refresh_token_enc = Column(Text, nullable=True)        # зашифрованный refresh token
    token_expiry = Column(DateTime, nullable=True)         # когда истекает access token (UTC)
    external_calendar_id = Column(String(255), nullable=True)  # id/URL целевого календаря
    # "connected" — рабочее; "reauth_required" — токен отозван/протух, нужен повтор
    status = Column(String(30), nullable=False, default="connected")
    account_email = Column(String(255), nullable=True)     # для показа «подключён как …»
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CalendarEventLink(Base):
    """Связь встречи OneOnOne с внешним событием календаря конкретного пользователя.

    Нужна, чтобы при обновлении/отмене встречи знать id внешнего события и
    обновить/удалить именно его (а не плодить дубликаты)."""
    __tablename__ = "calendar_event_links"
    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", "provider", name="uq_evtlink_meeting_user_provider"),
    )

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)
    external_event_id = Column(String(512), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class WebhookSubscription(Base):
    """Исходящий вебхук команды: URL + секрет подписи + набор событий."""
    __tablename__ = "webhook_subscriptions"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    url = Column(String(1000), nullable=False)
    secret = Column(String(128), nullable=False)           # для HMAC-подписи запроса
    # null/пусто = все поддерживаемые события; иначе список типов событий
    events = Column(JSON, nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, server_default=func.now())


class WebhookDelivery(Base):
    """Журнал доставки исходящего вебхука (последние события и их статус)."""
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending|success|failed
    status_code = Column(Integer, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    delivered_at = Column(DateTime, nullable=True)
