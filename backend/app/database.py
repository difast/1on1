import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

# Direct Supabase connection (db.*.supabase.co) is IPv6-only — Railway
# doesn't support IPv6. Use the Supabase connection pooler which is IPv4.
_DB_URL = (
    "postgresql://postgres.gxhmgwfgbouuvmdnswel:Assassins2552ass"
    "@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres"
    "?sslmode=require"
)

logger.info("DB → %s", _DB_URL.split("@")[1])

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
