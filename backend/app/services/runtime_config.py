from __future__ import annotations

from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.settings import TownshipSetting

RUNTIME_CONFIG_KEY = "runtime_config"


async def _fetch(session: AsyncSession) -> Dict[str, Any]:
    stmt = select(TownshipSetting).where(TownshipSetting.key == RUNTIME_CONFIG_KEY)
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    return record.value if record else {}


async def get_runtime_config(session: AsyncSession | None = None) -> Dict[str, Any]:
    if session is not None:
        return await _fetch(session)
    async with AsyncSessionLocal() as session_local:
        return await _fetch(session_local)


async def update_runtime_config(session: AsyncSession, updates: Dict[str, Any]) -> Dict[str, Any]:
    stmt = select(TownshipSetting).where(TownshipSetting.key == RUNTIME_CONFIG_KEY)
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    config = record.value if record else {}
    for key, value in updates.items():
        if value is None:
            config.pop(key, None)
        else:
            config[key] = value
    if record:
        record.value = config
    else:
        session.add(TownshipSetting(key=RUNTIME_CONFIG_KEY, value=config))
    await session.commit()
    return config


async def get_value(key: str, default: Any = None) -> Any:
    config = await get_runtime_config()
    return config.get(key, default)
