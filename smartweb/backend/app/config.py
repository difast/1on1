from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:Assassins2552ass@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    secret_key: str = "change-me"

    class Config:
        env_file = ".env"

settings = Settings()