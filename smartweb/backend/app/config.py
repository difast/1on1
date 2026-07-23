from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Реальное значение приходит из окружения (DATABASE_URL). Значение по
    # умолчанию не используется — app/database.py читает os.environ напрямую.
    database_url: str = ""
    # Redis для Celery. На managed-Redis (Timeweb) обычно один адрес — тогда
    # достаточно задать только REDIS_URL, а broker/backend возьмут его же
    # (см. свойства celery_broker/celery_backend). Явные CELERY_* переопределяют.
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    secret_key: str = "change-me"

    # --- Собственная аутентификация (email/пароль + JWT). Supabase убран. ---
    # Секрет подписи JWT: только из окружения (JWT_SECRET). Fallback на
    # secret_key оставлен, чтобы локальный запуск не падал, но в проде
    # обязательно задать JWT_SECRET.
    jwt_secret: str = ""
    jwt_expire_days: int = 30
    # Этап 8: принудительная проверка JWT на защищённых эндпоинтах. Когда флаг
    # включён (AUTH_ENFORCE=1), любой запрос к /api/* вне публичного списка
    # (вход/регистрация/health/вебхуки) без валидного токена получает 401.
    # По умолчанию выключен: включать только после smoke-теста всех способов
    # входа на боевой инфраструктуре. Отключение — только явным AUTH_ENFORCE=0,
    # тихого обхода на отдельных запросах нет.
    auth_enforce: bool = False

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
    # Режим получения апдейтов от Telegram: "webhook" (по умолчанию) или
    # "polling". polling полезен, когда входящий трафик до сервера фильтруется
    # и Telegram не может достучаться до вебхука — бот сам ходит за апдейтами.
    telegram_mode: str = "webhook"     # webhook | polling

    # --- Настроение и аналитика (блок 12/13/27/31) ---
    # Порог анонимности командной статистики настроения: если за день заполнили
    # меньше этого числа человек, команда получает сообщение о недостаточности
    # данных вместо статистики (нельзя вычислить конкретного человека).
    mood_anon_threshold: int = 3
    # Часовой пояс по умолчанию для команд без явного timezone. Сводка в 10:00
    # и границы суток считаются в этом поясе, а не в поясе сервера.
    default_timezone: str = "Europe/Moscow"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def celery_broker(self) -> str:
        """Брокер Celery: CELERY_BROKER_URL, иначе REDIS_URL."""
        return self.celery_broker_url or self.redis_url

    @property
    def celery_backend(self) -> str:
        """Backend результатов Celery: CELERY_RESULT_BACKEND, иначе REDIS_URL."""
        return self.celery_result_backend or self.redis_url

    @property
    def jwt_signing_key(self) -> str:
        """Ключ подписи JWT: JWT_SECRET из окружения, иначе secret_key."""
        return self.jwt_secret or self.secret_key

    @property
    def smtp_sender(self) -> str:
        return self.smtp_from or self.smtp_user

settings = Settings()