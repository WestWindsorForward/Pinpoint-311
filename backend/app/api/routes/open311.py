import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, rate_limit
from app.core.config import settings
from app.models.issue import IssueCategory, ServiceRequest, ServiceStatus
from app.schemas.open311 import Open311Request, Open311RequestCreate, Open311Service
from app.services import gis, notifications
from app.services.ai import analyze_request
from app.workers.tasks import ai_triage_task

router = APIRouter(prefix="/open311/v2", tags=["Open311"])


@router.get(
    "/services.json",
    response_model=list[Open311Service],
    dependencies=[Depends(rate_limit(settings.rate_limit_public_per_minute, "open311-services", "rate_limit_public_per_minute"))],
)
async def list_services(session: AsyncSession = Depends(get_db)) -> list[Open311Service]:
    stmt = select(IssueCategory).where(IssueCategory.is_active.is_(True))
    result = await session.execute(stmt)
    categories = result.scalars().all()
    return [
        Open311Service(
            service_code=category.slug,
            service_name=category.name,
            description=category.description,
            group=category.default_department,
            keywords=[category.slug],
        )
        for category in categories
    ]


@router.post(
    "/requests.json",
    response_model=list[Open311Request],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(rate_limit(settings.rate_limit_resident_per_minute, "open311-create", "rate_limit_resident_per_minute"))
    ],
)
async def create_request(payload: Open311RequestCreate, session: AsyncSession = Depends(get_db)) -> list[Open311Request]:
    stmt = select(IssueCategory).where(IssueCategory.slug == payload.service_code)
    result = await session.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Unknown service_code")

    boundary_ok = await gis.is_point_within_boundary(session, payload.lat, payload.long)
    if not boundary_ok:
        raise HTTPException(status_code=400, detail="Location outside township boundary")

    warning = await gis.jurisdiction_warning(session, payload.lat, payload.long)

    ai_result = await analyze_request(payload.description, payload.media_url)

    external_id = f"SR-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3)}"
    request = ServiceRequest(
        external_id=external_id,
        service_code=payload.service_code,
        description=payload.description,
        latitude=payload.lat,
        longitude=payload.long,
        address_string=payload.address_string,
        priority=category.default_priority,
        status=ServiceStatus.received,
        category_id=category.id,
        jurisdiction_warning=warning,
        ai_analysis=ai_result,
        metadata={
            "resident_email": payload.email,
            "resident_phone": payload.phone,
            "resident_name": " ".join(filter(None, [payload.first_name, payload.last_name])) or None,
            "media_url": payload.media_url,
        },
    )

    session.add(request)
    await session.commit()
    await session.refresh(request)

    ai_triage_task.delay(str(request.id))

    response = Open311Request(
        service_request_id=request.external_id,
        status=request.status,
        status_notes=warning,
        service_name=category.name,
        service_code=request.service_code,
        description=request.description,
        requested_datetime=request.created_at,
        updated_datetime=request.updated_at,
        priority=request.priority,
        service_address=request.address_string,
        lat=request.latitude,
        long=request.longitude,
        media_url=payload.media_url,
    )

    if payload.email:
        await notifications.notify_resident(session, request, template_slug="request_received")

    return [response]


@router.get("/requests/{external_id}.json", response_model=Open311Request)
async def get_request(external_id: str, session: AsyncSession = Depends(get_db)) -> Open311Request:
    stmt = select(ServiceRequest).where(ServiceRequest.external_id == external_id)
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    category = request.category
    return Open311Request(
        service_request_id=request.external_id,
        status=request.status,
        service_name=category.name if category else request.service_code,
        service_code=request.service_code,
        description=request.description,
        requested_datetime=request.created_at,
        updated_datetime=request.updated_at,
        priority=request.priority,
        service_address=request.address_string,
        lat=request.latitude,
        long=request.longitude,
        media_url=request.metadata.get("media_url") if request.metadata else None,
    )
