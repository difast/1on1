import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

# Always use Supabase. Railway injects DATABASE_URL pointing to its own
# internal PostgreSQL which we no longer use — ignore it entirely.
_DB_URL = (
    "postgresql://postgres:Assassins2552ass"
    "@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres"
    "?sslmode=require"
)

logger.info("DB → %s", _DB_URL.split("@")[1])  # log host only, no password

engine = create_engine(
    _DB_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 10},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
