import secrets
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi import Form as FastAPIForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.issue import IssueCategory, RequestAttachment, ServiceRequest, ServiceStatus
from app.models.settings import BrandingAsset, TownshipSetting
from app.schemas.issue import ServiceRequestRead
from app.services import gis
from app.services.ai import analyze_request
from app.services.notifications import notify_resident
from app.utils.storage import save_upload
from app.workers.tasks import ai_triage_task

router = APIRouter(prefix="/resident", tags=["Resident Portal"])


@router.get("/config", response_model=dict)
async def get_resident_config(session: AsyncSession = Depends(get_db)) -> dict:
    branding_stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
    branding_result = await session.execute(branding_stmt)
    branding = branding_result.scalar_one_or_none()

    assets_stmt = select(BrandingAsset)
    assets_result = await session.execute(assets_stmt)
    assets = {asset.key: asset.file_path for asset in assets_result.scalars().all()}

    categories_stmt = select(IssueCategory).where(IssueCategory.is_active.is_(True))
    categories_result = await session.execute(categories_stmt)

    return {
        "branding": branding.value if branding else {},
        "assets": assets,
        "categories": [
            {
                "slug": cat.slug,
                "name": cat.name,
                "description": cat.description,
                "priority": cat.default_priority.value,
            }
            for cat in categories_result.scalars().all()
        ],
    }


@router.post("/requests", response_model=ServiceRequestRead)
async def create_resident_request(
    service_code: Annotated[str, FastAPIForm(...)],
    description: Annotated[str, FastAPIForm(...)],
    address_string: Annotated[str | None, FastAPIForm(None)] = None,
    latitude: Annotated[float | None, FastAPIForm(None)] = None,
    longitude: Annotated[float | None, FastAPIForm(None)] = None,
    resident_name: Annotated[str | None, FastAPIForm(None)] = None,
    resident_email: Annotated[str | None, FastAPIForm(None)] = None,
    resident_phone: Annotated[str | None, FastAPIForm(None)] = None,
    media: UploadFile | None = File(None),
    session: AsyncSession = Depends(get_db),
) -> ServiceRequestRead:
    stmt = select(IssueCategory).where(IssueCategory.slug == service_code)
    result = await session.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Unknown category")

    boundary_ok = await gis.is_point_within_boundary(session, latitude, longitude)
    if not boundary_ok:
        raise HTTPException(status_code=400, detail="Location outside township boundary")

    ai_result = await analyze_request(description)

    metadata = {
        "resident_email": resident_email,
        "resident_phone": resident_phone,
        "resident_name": resident_name,
    }

    external_id = f"SR-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3)}"
    request = ServiceRequest(
        external_id=external_id,
        service_code=service_code,
        description=description,
        latitude=latitude,
        longitude=longitude,
        address_string=address_string,
        priority=category.default_priority,
        status=ServiceStatus.received,
        category_id=category.id,
        ai_analysis=ai_result,
        metadata=metadata,
    )

    session.add(request)
    await session.commit()
    await session.refresh(request)

    if media:
        file_path = save_upload(media.file, f"resident-{request.external_id}-{media.filename}")
        attachment = RequestAttachment(request_id=request.id, file_path=file_path, content_type=media.content_type)
        session.add(attachment)
        await session.commit()

    ai_triage_task.delay(str(request.id))

    if resident_email:
        await notify_resident(session, request, template_slug="request_received")

    return ServiceRequestRead.model_validate(request)


@router.get("/requests/{external_id}", response_model=ServiceRequestRead)
async def get_resident_request(external_id: str, session: AsyncSession = Depends(get_db)) -> ServiceRequestRead:
    stmt = select(ServiceRequest).where(ServiceRequest.external_id == external_id)
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return ServiceRequestRead.model_validate(request)
