from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.settings import TownshipSetting

SNAPSHOT_DIR = Path(settings.storage_dir).resolve() / "config"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

_KNOWN_KEYS = {"branding", "runtime_config"}


def snapshot_path(key: str) -> Path:
    return SNAPSHOT_DIR / f"{key}.json"


def save_snapshot(key: str, payload: dict[str, Any]) -> None:
    if key not in _KNOWN_KEYS:
        return
    path = snapshot_path(key)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def load_snapshot(key: str) -> dict[str, Any] | None:
    path = snapshot_path(key)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


async def bootstrap_from_disk(session: AsyncSession | None = None) -> None:
    """Ensure DB settings are restored from disk snapshots if needed."""
    close_session = False
    if session is None:
        session = AsyncSessionLocal()
        close_session = True
    try:
        for key in _KNOWN_KEYS:
            disk_value = load_snapshot(key)
            if disk_value is None:
                continue
            stmt = select(TownshipSetting).where(TownshipSetting.key == key)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record:
                continue
            session.add(TownshipSetting(key=key, value=disk_value))
        await session.commit()
    finally:
        if close_session:
            await session.close()
