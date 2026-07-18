from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Реальное значение приходит из окружения (DATABASE_URL). Значение по
    # умолчанию не используется — app/database.py читает os.environ напрямую.
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    secret_key: str = "change-me"

    # --- Собственная аутентификация (email/пароль + JWT). Supabase убран. ---
    # Секрет подписи JWT: только из окружения (JWT_SECRET). Fallback на
    # secret_key оставлен, чтобы локальный запуск не падал, но в проде
    # обязательно задать JWT_SECRET.
    jwt_secret: str = ""
    jwt_expire_days: int = 30

    # SMTP (Reg.ru) для писем подтверждения email и сброса пароля.
    # Пароль — только из окружения (SMTP_PASSWORD), в коде его нет.
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_encryption: str = "SSL"      # SSL | STARTTLS
    smtp_from: str = ""               # адрес отправителя; по умолчанию = smtp_user

    # DaData — поиск компаний по ИНН/БИН (Этап 2). Ключ хранится только на
    # сервере; фронт ходит через наш прокси. Без ключа поиск отдаёт пустой
    # список, а UI предлагает ручной ввод (запасной вариант).
    dadata_api_key: str = ""

    # Telegram-бот: регистрация/вход через бота и Telegram Login Widget.
    # ВСЕ значения — только из окружения, в коде секретов нет.
    telegram_bot_token: str = ""       # секрет, только env
    telegram_bot_username: str = ""    # напр. oneononehq_bot (без @) — публично
    telegram_webhook_secret: str = ""  # секрет для проверки заголовка вебхука
    app_web_url: str = ""              # базовый URL веба для ссылок из бота

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def jwt_signing_key(self) -> str:
        """Ключ подписи JWT: JWT_SECRET из окружения, иначе secret_key."""
        return self.jwt_secret or self.secret_key

    @property
    def smtp_sender(self) -> str:
        return self.smtp_from or self.smtp_user

settings = Settings()