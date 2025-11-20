import asyncio
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.issue import IssueCategory, ServiceRequest
from app.services import ai as ai_service
from app.services import email as email_service
from app.workers.celery_app import celery_app


async def _apply_ai_triage(request_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as session:
        request = await session.get(ServiceRequest, request_id)
        if not request:
            return
        analysis = await ai_service.analyze_request(request.description)
        request.ai_analysis = analysis
        if analysis.get("recommended_category"):
            stmt = select(IssueCategory).where(IssueCategory.slug == analysis["recommended_category"])
            result = await session.execute(stmt)
            category = result.scalar_one_or_none()
            if category:
                request.category_id = category.id
        await session.commit()


async def _send_developer_report() -> None:
    async with AsyncSessionLocal() as session:
        one_week_ago = datetime.utcnow() - timedelta(days=7)
        total_requests = await session.scalar(select(func.count(ServiceRequest.id)))
        new_requests = await session.scalar(
            select(func.count(ServiceRequest.id)).where(ServiceRequest.created_at >= one_week_ago)
        )
        category_breakdown = await session.execute(
            select(IssueCategory.name, func.count(ServiceRequest.id))
            .join(ServiceRequest, ServiceRequest.category_id == IssueCategory.id)
            .group_by(IssueCategory.name)
        )
        breakdown = {name: count for name, count in category_breakdown}

        body = (
            "Township Request Management System Weekly Report\n\n"
            f"Total Requests: {total_requests or 0}\n"
            f"New Requests (7d): {new_requests or 0}\n"
            f"Category Breakdown: {breakdown}\n"
        )

        await email_service.send_email(
            session,
            to=settings.developer_report_email,
            subject="Township Weekly Usage Report",
            body=body,
        )


@celery_app.task
def ai_triage_task(request_id: str) -> None:
    asyncio.run(_apply_ai_triage(uuid.UUID(request_id)))


@celery_app.task
def developer_heartbeat_task() -> None:
    asyncio.run(_send_developer_report())
