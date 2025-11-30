import uuid

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, require_roles
from app.core.config import settings
from app.models.issue import RequestAttachment, RequestUpdate, ServiceRequest, ServiceStatus
from app.models.user import User, UserRole
from app.schemas.issue import RequestUpdateCreate, RequestUpdateRead, ServiceRequestRead
from app.services import antivirus
from app.services.audit import log_event
from app.services.notifications import notify_resident
from app.services.pdf import generate_case_pdf
from app.services.webhook import broadcast_status_change
from app.utils.storage import save_file

router = APIRouter(prefix="/staff", tags=["Staff"])


@router.get("/requests", response_model=list[ServiceRequestRead])
async def list_requests(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.staff, UserRole.admin)),
) -> list[ServiceRequestRead]:
    stmt = (
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.attachments), selectinload(ServiceRequest.updates))
        .order_by(ServiceRequest.created_at.desc())
        .limit(200)
    )
    result = await session.execute(stmt)
    return [ServiceRequestRead.model_validate(req) for req in result.scalars().all()]


@router.patch("/requests/{request_id}", response_model=ServiceRequestRead)
async def update_request(
    request_id: uuid.UUID,
    payload: dict,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.staff, UserRole.admin)),
) -> ServiceRequestRead:
    service_request = await session.get(ServiceRequest, request_id)
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")
    if "status" in payload:
        service_request.status = ServiceStatus(payload["status"])
    if "priority" in payload:
        service_request.priority = payload["priority"]
    if "assigned_department" in payload:
        service_request.assigned_department = payload["assigned_department"]
    # allow updating a configured section via meta
    section = payload.get("request_section")
    if section is not None:
        current = service_request.meta or {}
        current["request_section"] = section
        service_request.meta = current
    await session.commit()
    await session.refresh(service_request, attribute_names=["attachments", "updates"])
    await broadcast_status_change(
        session, {"service_request_id": service_request.external_id, "status": service_request.status.value}
    )
    await log_event(
        session,
        action="service_request.update",
        actor=current_user,
        entity_type="service_request",
        entity_id=str(service_request.id),
        request=request,
        metadata=payload,
    )
    return ServiceRequestRead.model_validate(service_request)


@router.post("/requests/{request_id}/close", response_model=ServiceRequestRead)
async def close_request(
    request_id: uuid.UUID,
    request: Request,
    completion_photo: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.staff, UserRole.admin)),
) -> ServiceRequestRead:
    service_request = await session.get(ServiceRequest, request_id)
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")
    content = await completion_photo.read()
    await antivirus.scan_bytes(content)
    file_path = save_file(f"completion-{service_request.external_id}-{completion_photo.filename}", content)
    attachment = RequestAttachment(request_id=service_request.id, file_path=file_path, is_completion_photo=True)
    session.add(attachment)
    service_request.status = ServiceStatus.closed
    await session.commit()
    await session.refresh(service_request, attribute_names=["attachments", "updates"])
    await notify_resident(session, service_request, template_slug="request_closed")
    await log_event(
        session,
        action="service_request.close",
        actor=current_user,
        entity_type="service_request",
        entity_id=str(service_request.id),
        request=request,
    )
    return ServiceRequestRead.model_validate(service_request)


@router.get("/requests/{request_id}/pdf")
async def export_pdf(request_id: uuid.UUID, session: AsyncSession = Depends(get_db)) -> FileResponse:
    stmt = (
        select(ServiceRequest)
        .where(ServiceRequest.id == request_id)
        .options(selectinload(ServiceRequest.category))
    )
    result = await session.execute(stmt)
    service_request = result.scalar_one_or_none()
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")
    path = generate_case_pdf(service_request, Path(settings.storage_dir) / "pdfs")
    return FileResponse(path)


@router.post("/requests/{request_id}/comments", response_model=RequestUpdateRead)
async def add_request_comment(
    request_id: uuid.UUID,
    payload: RequestUpdateCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.staff, UserRole.admin)),
) -> RequestUpdateRead:
    service_request = await session.get(ServiceRequest, request_id)
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")
    update = RequestUpdate(
        request_id=service_request.id,
        author_id=current_user.id,
        notes=payload.notes,
        public=payload.public,
        status_override=payload.status_override,
    )
    session.add(update)
    if payload.status_override:
        service_request.status = payload.status_override
    await session.commit()
    await session.refresh(update)
    await session.refresh(service_request, attribute_names=["updates"])
    await log_event(
        session,
        action="service_request.comment",
        actor=current_user,
        entity_type="service_request",
        entity_id=str(service_request.id),
        request=request,
        metadata=payload.model_dump(),
    )
    return RequestUpdateRead.model_validate(update)


@router.get("/requests/{request_id}/attachments/{attachment_id}")
async def download_attachment(
    request_id: uuid.UUID,
    attachment_id: int,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.staff, UserRole.admin)),
) -> FileResponse:
    stmt = (
        select(RequestAttachment)
        .where(RequestAttachment.id == attachment_id, RequestAttachment.request_id == request_id)
    )
    result = await session.execute(stmt)
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = attachment.file_path
    if not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(file_path, media_type=attachment.content_type or "application/octet-stream")
