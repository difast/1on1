import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context
from app.database import Base
from app.models import *  # noqa: F401, F403

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def _get_url():
    return os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")

def run_migrations_offline():
    context.configure(url=_get_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    url = _get_url()
    # Supabase / Railway provide postgres:// — SQLAlchemy needs postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()