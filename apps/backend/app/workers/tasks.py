from __future__ import annotations

import asyncio
import logging

from celery import Celery
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models import WebhookDelivery
from app.services.open311 import send_webhook

logger = logging.getLogger(__name__)

settings = get_settings()

celery_app = Celery(
    "township",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=30,
)


@celery_app.task(name="webhook.deliver")
def deliver_webhook_task(delivery_id: int) -> None:
    asyncio.run(_deliver_webhook(delivery_id))


async def _deliver_webhook(delivery_id: int) -> None:
    async with AsyncSessionLocal() as session:
        delivery = await session.get(
            WebhookDelivery,
            delivery_id,
            options=[selectinload(WebhookDelivery.request)],
        )
        if not delivery:
            logger.warning("Webhook delivery %s not found", delivery_id)
            return

        await send_webhook(delivery)
        await session.commit()
