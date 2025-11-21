from __future__ import annotations

import asyncio
import logging
from typing import Any

import hvac
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.settings import ApiCredential

logger = logging.getLogger(__name__)
_vault_client: hvac.Client | None = None


def _get_vault_client() -> hvac.Client | None:
    global _vault_client
    if not settings.vault_enabled or not settings.vault_addr or not settings.vault_token:
        return None
    if _vault_client is None:
        _vault_client = hvac.Client(url=settings.vault_addr, token=settings.vault_token)
    return _vault_client


async def _read_from_vault(path: str) -> dict[str, Any] | None:
    client = _get_vault_client()
    if not client:
        return None

    def _read() -> dict[str, Any] | None:
        try:
            response = client.secrets.kv.v2.read_secret_version(
                mount_point=settings.vault_kv_mount,
                path=path,
            )
            return response["data"]["data"]
        except hvac.exceptions.InvalidPath:
            return None
        except Exception as exc:  # pragma: no cover - external
            logger.error("Vault read failed for %s: %s", path, exc)
            return None

    return await asyncio.to_thread(_read)


async def get_credentials(session: AsyncSession, provider: str) -> ApiCredential | None:
    stmt = select(ApiCredential).where(ApiCredential.provider == provider)
    result = await session.execute(stmt)
    cred = result.scalar_one_or_none()
    if cred:
        return cred

    data = await _read_from_vault(provider)
    if not data:
        return None
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else data
    return ApiCredential(
        provider=provider,
        key=data.get("key", ""),
        secret=data.get("secret", ""),
        meta=metadata,
    )
