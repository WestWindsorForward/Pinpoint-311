import hashlib
import hmac
import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import OutboundWebhookEndpoint

logger = logging.getLogger(__name__)


async def broadcast_status_change(session: AsyncSession, payload: dict) -> None:
    stmt = select(OutboundWebhookEndpoint).where(OutboundWebhookEndpoint.is_active.is_(True))
    result = await session.execute(stmt)
    endpoints = result.scalars().all()
    if not endpoints:
        return

    async with httpx.AsyncClient(timeout=10) as client:
        for endpoint in endpoints:
            body = json.dumps(payload)
            headers = {}
            if endpoint.secret:
                signature = hmac.new(endpoint.secret.encode(), body.encode(), hashlib.sha256).hexdigest()
                headers["X-Signature"] = signature
            try:
                resp = await client.post(endpoint.url, data=body, headers=headers, timeout=10)
                resp.raise_for_status()
            except Exception as exc:  # pragma: no cover - network best effort
                logger.error("Webhook delivery failed for %s: %s", endpoint.url, exc)
