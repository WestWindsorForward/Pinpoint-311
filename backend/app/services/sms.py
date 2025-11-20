import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import ApiCredential

logger = logging.getLogger(__name__)


async def send_sms(session: AsyncSession, *, to: str, body: str) -> None:
    stmt = select(ApiCredential).where(ApiCredential.provider == "sms")
    result = await session.execute(stmt)
    cred = result.scalar_one_or_none()
    if not cred:
        logger.warning("SMS credentials missing; skipping SMS to %s", to)
        return

    url = cred.metadata.get("webhook_url") if cred.metadata else None
    if not url:
        logger.error("SMS webhook URL missing in credentials metadata")
        return

    payload = {"to": to, "body": body, "key": cred.key, "secret": cred.secret}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
