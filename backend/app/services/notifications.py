from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import ServiceRequest
from app.models.settings import NotificationTemplate
from app.services import email as email_service
from app.services import sms as sms_service


async def notify_resident(session: AsyncSession, request: ServiceRequest, *, template_slug: str, channel: str = "email") -> None:
    stmt = select(NotificationTemplate).where(NotificationTemplate.slug == template_slug)
    result = await session.execute(stmt)
    template = result.scalar_one_or_none()
    if not template:
        return

    body = template.body.format(
        town_name="",
        service_request_id=request.external_id,
        status=request.status.value,
        description=request.description,
    )

    if channel == "email" and request.meta and request.meta.get("resident_email"):
        await email_service.send_email(session, to=request.meta["resident_email"], subject=template.subject, body=body)
    elif channel == "sms" and request.meta and request.meta.get("resident_phone"):
        await sms_service.send_sms(session, to=request.meta["resident_phone"], body=body)
