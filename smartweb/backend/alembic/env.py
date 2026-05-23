import os
import logging
from logging.config import fileConfig
from sqlalchemy import pool, create_engine
from alembic import context
from app.database import Base
from app.models import *  # noqa: F401, F403

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

logger = logging.getLogger(__name__)
logger.info("Alembic DB → %s", DATABASE_URL.split("@")[-1])


def run_migrations_offline():
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(
        DATABASE_URL,
        poolclass=pool.NullPool,
        connect_args={"connect_timeout": 10},
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
