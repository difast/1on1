from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:Assassins2552ass@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    secret_key: str = "change-me"

    # --- Auth (billing foundation). Enforcement stays OFF until AUTH_ENFORCE is
    # set in the environment, so deploying this never breaks access. ---
    auth_enforce: bool = False
    supabase_jwt_secret: str = ""
    admin_api_token: str = ""

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

settings = Settings()