"""Модели усиления входа (Блок 1): сессии, известные устройства, резервные коды 2FA.

- UserSession: активная сессия/устройство. JWT несёт session-id (jti); ревокация
  и автовыход по бездействию работают через эту таблицу.
- UserDevice: известное («доверенное») устройство пользователя. Вход с
  неизвестного устройства требует подтверждения кодом по email.
- TotpBackupCode: одноразовые резервные коды на случай потери аутентификатора.
  Хранятся только как хэш (в открытом виде показываются один раз при генерации).
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, func
from app.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Идентификатор сессии = claim jti в JWT. Ревокация помечает revoked_at.
    jti = Column(String(64), unique=True, nullable=False, index=True)
    # Стабильный идентификатор устройства (хэш) — ключ дедупликации: одна активная
    # сессия на устройство, чтобы список сессий не заполнялся дублями (Задача 4).
    device_hash = Column(String(64), nullable=True, index=True)
    device_label = Column(String(255), nullable=True)   # из user-agent (не секрет)
    ip = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_active_at = Column(DateTime, server_default=func.now())
    revoked_at = Column(DateTime, nullable=True)


class UserDevice(Base):
    __tablename__ = "user_devices"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Долгоживущий идентификатор устройства с клиента, хранится как ХЭШ (не сырой).
    device_hash = Column(String(64), nullable=False, index=True)
    label = Column(String(255), nullable=True)          # из user-agent
    ip = Column(String(64), nullable=True)
    trusted = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, server_default=func.now())
    last_seen_at = Column(DateTime, server_default=func.now())


class TotpBackupCode(Base):
    __tablename__ = "totp_backup_codes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash = Column(String(128), nullable=False)     # bcrypt-хэш кода
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
