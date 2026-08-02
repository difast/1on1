import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

logger.info("DB → %s", DATABASE_URL.split("@")[-1])

# Параметры соединения ниже специфичны для PostgreSQL (libpq). Применяем их
# только к нему: SQLite такие ключи не понимает и падает с TypeError. SQLite
# нужен для прогона тестов без внешней базы; на боевом стенде всегда PostgreSQL.
_is_postgres = DATABASE_URL.startswith(("postgresql", "postgres:"))

_engine_kwargs = {"pool_pre_ping": True}
if _is_postgres:
    _engine_kwargs.update(
        pool_recycle=300,
        pool_size=3,
        max_overflow=7,
        pool_timeout=30,
        connect_args={
            "connect_timeout": 10,
            # Keep TCP connection alive so the load balancer doesn't silently
            # drop idle connections between requests.
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        },
    )

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
