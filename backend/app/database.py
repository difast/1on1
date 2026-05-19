import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_SUPABASE_URL = "postgresql://postgres:Assassins2552ass@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres?sslmode=require"

def _build_url():
    url = os.environ.get("DATABASE_URL", "")
    # Ignore Railway's internal PostgreSQL — only accept Supabase
    if "supabase.co" not in url:
        return _SUPABASE_URL
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "sslmode" not in url:
        url += "?sslmode=require"
    return url

_db_url = _build_url()

engine = create_engine(
    _db_url,
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
