from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import AppConfiguration, get_settings
from app.core.enums import WebhookDeliveryStatus
from app.models import RequestStatusHistory, ServiceRequest, WebhookDelivery

logger = logging.getLogger(__name__)

settings = get_settings()
config: AppConfiguration = settings.township_config  # type: ignore[assignment]


def _target_url() -> str | None:
    if settings.open311_endpoint_url:
        return settings.open311_endpoint_url
    if config.open311 and config.open311.endpoint_url:
        return str(config.open311.endpoint_url)
    return None


async def schedule_status_webhook(
    session: AsyncSession,
    request: ServiceRequest,
    history: RequestStatusHistory | None,
) -> WebhookDelivery | None:
    url = _target_url()
    if not url:
        logger.debug("No Open311 endpoint configured; skipping webhook scheduling")
        return None

    payload = build_open311_payload(request, history)
    delivery = WebhookDelivery(
        request_id=request.id,
        target_url=url,
        payload=payload,
    )
    session.add(delivery)
    await session.flush()
    return delivery


def build_open311_payload(request: ServiceRequest, history: RequestStatusHistory | None) -> dict:
    status_time = history.created_at if history else request.updated_at
    payload = {
        "service_request_id": request.public_id,
        "service_code": request.category_code,
        "status": request.status.value,
        "status_notes": history.note if history else None,
        "status_datetime": (status_time.isoformat() if isinstance(status_time, datetime) else None),
        "agency_responsible": request.assigned_department,
        "service_notice": None,
        "requested_datetime": request.created_at.isoformat() if request.created_at else None,
        "updated_datetime": request.updated_at.isoformat() if request.updated_at else None,
        "address": request.location_address,
        "lat": request.location_lat,
        "long": request.location_lng,
        "jurisdiction_id": (config.open311.jurisdiction_id if config.open311 else None),
        "media_url": None,
    }
    return payload


async def send_webhook(delivery: WebhookDelivery) -> None:
    url = delivery.target_url
    if not url:
        logger.warning("Webhook delivery missing target URL")
        return

    timeout = settings.township_config.notification.webhook_timeout_seconds  # type: ignore[union-attr]

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(url, json=delivery.payload)
            delivery.attempts += 1
            delivery.last_attempt_at = datetime.now(timezone.utc)
            delivery.response_status = response.status_code
            delivery.response_body = response.text[:2000]
            if response.status_code < 400:
                delivery.status = WebhookDeliveryStatus.SUCCESS
            else:
                delivery.status = WebhookDeliveryStatus.FAILED
        except Exception as exc:  # pragma: no cover - I/O handling
            logger.warning("Webhook delivery failed: %s", exc)
            delivery.attempts += 1
            delivery.last_attempt_at = datetime.now(timezone.utc)
            delivery.status = WebhookDeliveryStatus.FAILED
            delivery.response_body = str(exc)
