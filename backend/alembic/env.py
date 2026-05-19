import os
from logging.config import fileConfig
from sqlalchemy import pool, create_engine
from alembic import context
from app.database import Base
from app.models import *  # noqa: F401, F403

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


_SUPABASE_URL = "postgresql://postgres:Assassins2552ass@db.gxhmgwfgbouuvmdnswel.supabase.co:5432/postgres?sslmode=require"


def _get_url():
    url = os.environ.get("DATABASE_URL", "")
    # Ignore Railway's internal PostgreSQL — only accept Supabase
    if "supabase.co" not in url:
        return _SUPABASE_URL
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "sslmode" not in url:
        sep = "&" if "?" in url else "?"
        url += sep + "sslmode=require"
    return url


def run_migrations_offline():
    context.configure(url=_get_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(_get_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
