import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Request, status
from fastapi import Form as FastAPIForm
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_optional_user, rate_limit
from app.core.config import settings
from app.models.issue import IssueCategory, RequestAttachment, ServiceRequest, ServiceStatus
from app.models.settings import BrandingAsset, TownshipSetting
from app.models.user import User, UserRole
from app.schemas.issue import ServiceRequestRead
from app.services import antivirus, gis, runtime_config as runtime_config_service
from app.services.ai import analyze_request
from app.services.notifications import notify_resident
from app.services.pdf import generate_case_pdf
from app.utils.storage import public_storage_url, save_upload
from app.workers.tasks import ai_triage_task

router = APIRouter(prefix="/resident", tags=["Resident Portal"])


@router.get("/config", response_model=dict)
async def get_resident_config(request: Request, session: AsyncSession = Depends(get_db)) -> dict:
    branding_stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
    branding_result = await session.execute(branding_stmt)
    branding = branding_result.scalar_one_or_none()

    assets_stmt = select(BrandingAsset)
    assets_result = await session.execute(assets_stmt)
    assets = {
        asset.key: public_storage_url(request, asset.file_path)
        for asset in assets_result.scalars().all()
    }

    categories_stmt = select(IssueCategory).where(IssueCategory.is_active.is_(True))
    categories_result = await session.execute(categories_stmt)
    runtime_cfg = await runtime_config_service.get_runtime_config(session)
    maps_key = (
        runtime_cfg.get("google_maps_api_key") if isinstance(runtime_cfg, dict) else None
    ) or settings.google_maps_api_key

    defaults = settings.branding.model_dump()
    branding_payload: dict[str, Any] = dict(defaults)
    if branding:
        branding_payload.update(branding.value)
    if assets.get("logo"):
        branding_payload["logo_url"] = assets["logo"]
    if assets.get("seal"):
        branding_payload["seal_url"] = assets["seal"]
    if assets.get("favicon"):
        branding_payload["favicon_url"] = assets["favicon"]

    return {
        "branding": branding_payload,
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
    media: list[UploadFile] | None = File(None),
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ServiceRequestRead:
    stmt = select(IssueCategory).where(IssueCategory.slug == service_code)
    result = await session.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Unknown category")

    warning = None

    ai_result = None
    try:
        ai_result = await analyze_request(description, session=session)
    except Exception:
        ai_result = None

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
        assigned_department=category.default_department_slug,
        jurisdiction_warning=warning,
        ai_analysis=ai_result,
        meta=metadata,
        resident_id=current_user.id if current_user else None,
    )

    session.add(request)
    await session.commit()
    await session.refresh(request)

    if media:
        attachments: list[RequestAttachment] = []
        for upload in media:
            if not upload:
                continue
            await antivirus.scan_file(upload.file)
            file_path = save_upload(upload.file, f"resident-{request.external_id}-{upload.filename}")
            attachments.append(
                RequestAttachment(
                    request_id=request.id,
                    file_path=file_path,
                    content_type=upload.content_type,
                    uploaded_by_id=current_user.id if current_user else None,
                )
            )
        if attachments:
            session.add_all(attachments)
            await session.commit()

    ai_triage_task.delay(str(request.id))

    if resident_email:
        await notify_resident(session, request, template_slug="request_received")

    await session.refresh(request, attribute_names=["attachments", "updates"])
    return ServiceRequestRead.model_validate(request)


@router.get("/requests", response_model=list[ServiceRequestRead])
async def list_my_requests(
    current_user: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
) -> list[ServiceRequestRead]:
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    stmt = (
        select(ServiceRequest)
        .where(ServiceRequest.resident_id == current_user.id)
        .options(selectinload(ServiceRequest.attachments), selectinload(ServiceRequest.updates))
        .order_by(ServiceRequest.created_at.desc())
    )
    result = await session.execute(stmt)
    return [ServiceRequestRead.model_validate(req) for req in result.scalars().all()]


@router.get("/requests/{external_id}", response_model=ServiceRequestRead)
async def get_resident_request(
    external_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ServiceRequestRead:
    stmt = (
        select(ServiceRequest)
        .where(ServiceRequest.external_id == external_id)
        .options(selectinload(ServiceRequest.attachments), selectinload(ServiceRequest.updates))
    )
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return ServiceRequestRead.model_validate(request)


@router.get("/requests/recent", response_model=list[ServiceRequestRead])
async def recent_requests(limit: int = 5, session: AsyncSession = Depends(get_db)) -> list[ServiceRequestRead]:
    stmt = (
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.attachments), selectinload(ServiceRequest.updates))
        .order_by(ServiceRequest.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return [ServiceRequestRead.model_validate(req) for req in result.scalars().all()]


@router.get("/requests/{external_id}/attachments/{attachment_id}")
async def download_public_attachment(
    external_id: str,
    attachment_id: int,
    session: AsyncSession = Depends(get_db),
) -> FileResponse:
    stmt = (
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.attachments))
        .where(ServiceRequest.external_id == external_id)
    )
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    attachment = next((att for att in request.attachments if att.id == attachment_id), None)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(attachment.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(str(path), media_type=attachment.content_type or "application/octet-stream")


@router.get("/requests/{external_id}/pdf")
async def download_public_pdf(external_id: str, session: AsyncSession = Depends(get_db)) -> FileResponse:
    stmt = (
        select(ServiceRequest)
        .where(ServiceRequest.external_id == external_id)
        .options(selectinload(ServiceRequest.category))
    )
    result = await session.execute(stmt)
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    path = generate_case_pdf(request, Path(settings.storage_dir) / "pdfs")
    return FileResponse(path)
