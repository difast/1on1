import socket
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

# Railway doesn't support IPv6. Supabase resolves to IPv6 by default.
# Force all DNS lookups to return IPv4 only.
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(host, port, family=0, *args, **kwargs):
    return _orig_getaddrinfo(host, port, socket.AF_INET, *args, **kwargs)
socket.getaddrinfo = _ipv4_getaddrinfo

# Always use Supabase. Railway auto-injects DATABASE_URL from its own
# internal PostgreSQL — we ignore it entirely.
_DB_URL = (
    "postgresql://postgres:Assassins2552ass"
    "@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres"
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
