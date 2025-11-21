import secrets
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi import Form as FastAPIForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_user, rate_limit
from app.core.config import settings
from app.models.issue import IssueCategory, RequestAttachment, ServiceRequest, ServiceStatus
from app.models.settings import BrandingAsset, TownshipSetting
from app.models.user import User, UserRole
from app.schemas.issue import ServiceRequestRead
from app.services import antivirus, gis, runtime_config as runtime_config_service
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
    runtime_cfg = await runtime_config_service.get_runtime_config(session)
    maps_key = runtime_cfg.get("google_maps_api_key") or settings.google_maps_api_key

    return {
        "branding": branding.value if branding else {},
        "assets": assets,
        "integrations": {
            "google_maps_api_key": maps_key,
        },
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


@router.post(
    "/requests",
    response_model=ServiceRequestRead,
    dependencies=[
        Depends(rate_limit(settings.rate_limit_resident_per_minute, "resident-create", "rate_limit_resident_per_minute"))
    ],
)
async def create_resident_request(
    service_code: Annotated[str, FastAPIForm(...)],
    description: Annotated[str, FastAPIForm(...)],
    address_string: Annotated[str | None, FastAPIForm()] = None,
    latitude: Annotated[float | None, FastAPIForm()] = None,
    longitude: Annotated[float | None, FastAPIForm()] = None,
    resident_name: Annotated[str | None, FastAPIForm()] = None,
    resident_email: Annotated[str | None, FastAPIForm()] = None,
    resident_phone: Annotated[str | None, FastAPIForm()] = None,
    media: UploadFile | None = File(None),
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
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
        meta=metadata,
        resident_id=current_user.id if current_user else None,
    )

    session.add(request)
    await session.commit()
    await session.refresh(request)

    if media:
        await antivirus.scan_file(media.file)
        file_path = save_upload(media.file, f"resident-{request.external_id}-{media.filename}")
        attachment = RequestAttachment(request_id=request.id, file_path=file_path, content_type=media.content_type)
        session.add(attachment)
        await session.commit()

    ai_triage_task.delay(str(request.id))

    if resident_email:
        await notify_resident(session, request, template_slug="request_received")

    return ServiceRequestRead.model_validate(request)


@router.get("/requests", response_model=list[ServiceRequestRead])
async def list_my_requests(
    current_user: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
) -> list[ServiceRequestRead]:
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    stmt = select(ServiceRequest).where(ServiceRequest.resident_id == current_user.id).order_by(ServiceRequest.created_at.desc())
    result = await session.execute(stmt)
    return [ServiceRequestRead.model_validate(req) for req in result.scalars().all()]


@router.get("/requests/{external_id}", response_model=ServiceRequestRead)
async def get_resident_request(
    external_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ServiceRequestRead:
    stmt = select(ServiceRequest).where(ServiceRequest.external_id == external_id)
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user and current_user.role == UserRole.resident and request.resident_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this request")
    return ServiceRequestRead.model_validate(request)
