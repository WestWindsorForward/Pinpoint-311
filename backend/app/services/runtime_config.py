from __future__ import annotations

from typing import Any, Dict

from pydantic import AnyUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import URL

from app.db.session import AsyncSessionLocal
from app.models.settings import TownshipSetting

RUNTIME_CONFIG_KEY = "runtime_config"


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_jsonable(item) for item in value]
    if isinstance(value, (AnyUrl, URL)):
        return str(value)
    return value


def _ensure_jsonable(data: Dict[str, Any]) -> Dict[str, Any]:
    return {key: _jsonable(value) for key, value in data.items()}


async def _fetch(session: AsyncSession) -> Dict[str, Any]:
    stmt = select(TownshipSetting).where(TownshipSetting.key == RUNTIME_CONFIG_KEY)
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    return _ensure_jsonable(record.value if record else {})


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
        record.value = _ensure_jsonable(config)
    else:
        session.add(TownshipSetting(key=RUNTIME_CONFIG_KEY, value=_ensure_jsonable(config)))
    await session.commit()
    return _ensure_jsonable(config)


async def get_value(key: str, default: Any = None) -> Any:
    config = await get_runtime_config()
    return config.get(key, default)
