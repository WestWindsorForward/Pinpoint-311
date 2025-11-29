from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import settings
from app.db.base import Base

config = context.config
if config.config_ini_section is not None:
    config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    try:
        result = connection.exec_driver_sql(
            "SELECT character_maximum_length FROM information_schema.columns WHERE table_name='alembic_version' AND column_name='version_num'"
        )
        row = result.fetchone()
        if row and row[0] is not None and row[0] < 64:
            connection.exec_driver_sql(
                "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"
            )
    except Exception:
        pass
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = AsyncEngine(
        engine_from_config(
            config.get_section(config.config_ini_section) or {},
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
            future=True,
        )
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online_sync() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)


def run_migrations():
    if config.get_main_option("sqlalchemy.url", "").startswith("sqlite"):
        run_migrations_online_sync()
    else:
        asyncio.run(run_migrations_online())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations()
