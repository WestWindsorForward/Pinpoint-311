from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_manager_user, get_worker_user
from app.core.database import get_db
from app.core.enums import AttachmentType, NotificationMethod, RequestPriority, RequestStatus
from app.models import AuditLog, RequestAttachment, RequestNote, RequestStatusHistory, ServiceRequest
from app.schemas.request import (
    AttachmentRead,
    RequestAssignmentUpdate,
    RequestNoteCreate,
    RequestNoteRead,
    RequestPriorityUpdate,
    RequestStatusUpdate,
    StaffRequestDetail,
    StaffRequestListItem,
)
from app.services.export import requests_to_csv
from app.services.files import save_upload_file
from app.services.notifications import send_email_notification, send_sms_notification
from app.services.open311 import schedule_status_webhook
from app.workers.tasks import deliver_webhook_task

router = APIRouter(prefix="/staff", tags=["Staff Portal"])


@router.get("/dashboard")
async def dashboard(session: AsyncSession = Depends(get_db), user=Depends(get_manager_user)):
    counts = await session.execute(
        select(ServiceRequest.status, func.count()).group_by(ServiceRequest.status)
    )
    summary = {status.value: count for status, count in counts.all()}
    return {"summary": summary}


@router.get("/requests", response_model=list[StaffRequestListItem])
async def list_requests(
    status_filter: RequestStatus | None = None,
    priority_filter: RequestPriority | None = None,
    category_code: str | None = None,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
):
    query = select(ServiceRequest).options(selectinload(ServiceRequest.assigned_to)).order_by(ServiceRequest.created_at.desc())
    if status_filter:
        query = query.where(ServiceRequest.status == status_filter)
    if priority_filter:
        query = query.where(ServiceRequest.priority == priority_filter)
    if category_code:
        query = query.where(ServiceRequest.category_code == category_code)

    results = await session.execute(query)
    requests = results.scalars().all()
    return [StaffRequestListItem.model_validate(req) for req in requests]


@router.get("/requests/{request_id}", response_model=StaffRequestDetail)
async def get_request_detail(
    request_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
):
    request = await _get_request(session, request_id)
    return StaffRequestDetail.model_validate(request)


@router.patch("/requests/{request_id}/status", response_model=StaffRequestDetail)
async def update_request_status(
    request_id: uuid.UUID,
    payload: RequestStatusUpdate,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
):
    request = await _get_request(session, request_id)
    if request.status == payload.status:
        return StaffRequestDetail.model_validate(request)

    history = RequestStatusHistory(
        request_id=request.id,
        from_status=request.status,
        to_status=payload.status,
        changed_by_id=user.id,
        note=payload.note,
    )
    request.status = payload.status
    request.updated_at = datetime.now(timezone.utc)
    session.add(history)
    session.add(
        AuditLog(
            actor_user_id=user.id,
            request_id=request.id,
            action_type="request.status_changed",
            details={"from": history.from_status.value if history.from_status else None, "to": history.to_status.value},
        )
    )

    delivery = await schedule_status_webhook(session, request, history)

    await session.commit()
    await session.refresh(request)

    if delivery:
        deliver_webhook_task.delay(delivery.id)

    await session.refresh(request, attribute_names=["notifications"])
    await _notify_subscribers(request)
    return StaffRequestDetail.model_validate(request)


@router.patch("/requests/{request_id}/priority", response_model=StaffRequestDetail)
async def update_priority(
    request_id: uuid.UUID,
    payload: RequestPriorityUpdate,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
):
    request = await _get_request(session, request_id)
    request.priority = payload.priority
    session.add(
        AuditLog(
            actor_user_id=user.id,
            request_id=request.id,
            action_type="request.priority_changed",
            details={"priority": payload.priority.value},
        )
    )
    await session.commit()
    await session.refresh(request)
    return StaffRequestDetail.model_validate(request)


@router.patch("/requests/{request_id}/assignment", response_model=StaffRequestDetail)
async def update_assignment(
    request_id: uuid.UUID,
    payload: RequestAssignmentUpdate,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_manager_user),
):
    request = await _get_request(session, request_id)
    request.assigned_department = payload.assigned_department or request.assigned_department
    request.assigned_to_id = payload.assigned_to_id
    session.add(
        AuditLog(
            actor_user_id=user.id,
            request_id=request.id,
            action_type="request.assignment_changed",
            details={
                "assigned_department": request.assigned_department,
                "assigned_to_id": str(request.assigned_to_id) if request.assigned_to_id else None,
            },
        )
    )
    await session.commit()
    await session.refresh(request)
    return StaffRequestDetail.model_validate(request)


@router.post("/requests/{request_id}/notes", response_model=RequestNoteRead, status_code=status.HTTP_201_CREATED)
async def add_note(
    request_id: uuid.UUID,
    payload: RequestNoteCreate,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
):
    request = await _get_request(session, request_id)
    note = RequestNote(
        request_id=request.id,
        author_id=user.id,
        visibility=payload.visibility,
        body=payload.body,
    )
    session.add(note)
    session.add(
        AuditLog(
            actor_user_id=user.id,
            request_id=request.id,
            action_type="request.note_added",
            details={"visibility": payload.visibility.value},
        )
    )
    await session.commit()
    await session.refresh(note)
    await session.refresh(request)
    return RequestNoteRead.model_validate(note)


@router.post("/requests/{request_id}/attachments", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user=Depends(get_worker_user),
    attachment_type: AttachmentType = AttachmentType.OTHER,
):
    request = await _get_request(session, request_id)
    stored_path = await save_upload_file(file, f"requests/{request.public_id}")
    attachment = RequestAttachment(
        request_id=request.id,
        uploaded_by_id=user.id,
        file_path=stored_path,
        file_type=attachment_type,
        label=file.filename,
    )
    if attachment_type == AttachmentType.COMPLETION:
        request.completion_photo_path = stored_path
    session.add(attachment)
    session.add(
        AuditLog(
            actor_user_id=user.id,
            request_id=request.id,
            action_type="request.attachment_added",
            details={"file_type": attachment_type.value},
        )
    )
    await session.commit()
    await session.refresh(attachment)
    await session.refresh(request)
    return AttachmentRead.model_validate(attachment)


@router.get("/requests/export")
async def export_requests(
    status_filter: RequestStatus | None = None,
    session: AsyncSession = Depends(get_db),
    user=Depends(get_manager_user),
):
    query = select(ServiceRequest).options(selectinload(ServiceRequest.assigned_to))
    if status_filter:
        query = query.where(ServiceRequest.status == status_filter)
    results = await session.execute(query)
    requests = results.scalars().all()
    csv_data = requests_to_csv(requests)
    filename = "requests_export.csv"
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def _get_request(session: AsyncSession, request_id: uuid.UUID) -> ServiceRequest:
    result = await session.execute(
        select(ServiceRequest)
        .options(
            selectinload(ServiceRequest.assigned_to),
            selectinload(ServiceRequest.notes).selectinload(RequestNote.author),
            selectinload(ServiceRequest.attachments),
            selectinload(ServiceRequest.history).selectinload(RequestStatusHistory.changed_by),
            selectinload(ServiceRequest.notifications),
        )
        .where(ServiceRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return request


async def _notify_subscribers(request: ServiceRequest) -> None:
    notification_message = f"Your request {request.public_id} status changed to {request.status.value}."
    for opt_in in request.notifications:
        if opt_in.method == NotificationMethod.EMAIL and opt_in.target:
            await send_email_notification(
                opt_in.target,
                subject=f"Request {request.public_id} status update",
                html_body=notification_message,
                text_body=notification_message,
            )
        if opt_in.method == NotificationMethod.SMS and opt_in.target:
            await send_sms_notification(opt_in.target, notification_message)
