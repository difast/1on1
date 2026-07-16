"""Код подтверждения для привязки Telegram к существующему аккаунту (Этап 4).

Бот выдаёт короткий код, привязанный к Telegram-идентити; пользователь вводит
его в настройках профиля на вебе (будучи залогиненным в свой email-аккаунт),
и мы связываем telegram_id с этим аккаунтом — без создания дубля.
"""
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, func
from app.database import Base


class TelegramLinkRequest(Base):
    __tablename__ = "telegram_link_requests"

    id = Column(Integer, primary_key=True)
    code = Column(String(12), nullable=False, unique=True, index=True)
    telegram_id = Column(BigInteger, nullable=False)
    first_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    photo_url = Column(String(1000), nullable=True)
    consumed = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
