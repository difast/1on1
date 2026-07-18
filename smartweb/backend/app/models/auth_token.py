from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from app.database import Base


class AuthToken(Base):
    """Одноразовый токен для подтверждения email и сброса пароля.

    purpose:
      confirm — подтверждение email (срок жизни 24 часа);
      reset   — сброс пароля (срок жизни 1 час).
    used_at проставляется при использовании — повторно токен не сработает.
    """
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(128), unique=True, nullable=False, index=True)
    purpose = Column(String(20), nullable=False)  # confirm | reset
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
