import uuid

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.models.issue import RequestAttachment, ServiceRequest, ServiceStatus
from app.schemas.issue import ServiceRequestRead
from app.services.notifications import notify_resident
from app.services.pdf import generate_case_pdf
from app.services.webhook import broadcast_status_change
from app.utils.storage import save_file

router = APIRouter(prefix="/staff", tags=["Staff"], dependencies=[Depends(require_admin)])


@router.get("/requests", response_model=list[ServiceRequestRead])
async def list_requests(session: AsyncSession = Depends(get_db)) -> list[ServiceRequestRead]:
    result = await session.execute(select(ServiceRequest).order_by(ServiceRequest.created_at.desc()).limit(200))
    return [ServiceRequestRead.model_validate(req) for req in result.scalars().all()]


@router.patch("/requests/{request_id}", response_model=ServiceRequestRead)
async def update_request(request_id: uuid.UUID, payload: dict, session: AsyncSession = Depends(get_db)) -> ServiceRequestRead:
    request = await session.get(ServiceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if "status" in payload:
        request.status = ServiceStatus(payload["status"])
    if "priority" in payload:
        request.priority = payload["priority"]
    if "assigned_department" in payload:
        request.assigned_department = payload["assigned_department"]
    await session.commit()
    await session.refresh(request)
    await broadcast_status_change(session, {"service_request_id": request.external_id, "status": request.status.value})
    return ServiceRequestRead.model_validate(request)


@router.post("/requests/{request_id}/close", response_model=ServiceRequestRead)
async def close_request(
    request_id: uuid.UUID,
    completion_photo: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
) -> ServiceRequestRead:
    request = await session.get(ServiceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    content = await completion_photo.read()
    file_path = save_file(f"completion-{request.external_id}-{completion_photo.filename}", content)
    attachment = RequestAttachment(request_id=request.id, file_path=file_path, is_completion_photo=True)
    session.add(attachment)
    request.status = ServiceStatus.closed
    await session.commit()
    await session.refresh(request)
    await notify_resident(session, request, template_slug="request_closed")
    return ServiceRequestRead.model_validate(request)


@router.get("/requests/{request_id}/pdf")
async def export_pdf(request_id: uuid.UUID, session: AsyncSession = Depends(get_db)) -> FileResponse:
    request = await session.get(ServiceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    path = generate_case_pdf(request, Path("storage/pdfs"))
    return FileResponse(path)
