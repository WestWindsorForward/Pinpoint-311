from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import AttachmentType, NotificationMethod, NoteVisibility, RequestStatus
from app.models import NotificationOptIn, RequestAttachment, RequestNote, RequestStatusHistory, ServiceRequest
from app.schemas.request import (
    JurisdictionCheckResponse,
    NotificationOptInCreate,
    ResidentRequestCreate,
    ResidentRequestDetail,
    ResidentRequestSummary,
    ResidentTimelineEntry,
    RequestNotePublic,
)
from app.services.ai import classify_request
from app.services.files import save_upload_file
from app.services.jurisdiction import check_jurisdiction

router = APIRouter(prefix="/resident", tags=["Resident Portal"])


def _generate_public_id() -> str:
    return secrets.token_hex(4).upper()


@router.post("/requests", response_model=ResidentRequestSummary, status_code=status.HTTP_201_CREATED)
async def submit_request(
    payload: str = Form(...),
    initial_photo: UploadFile | None = File(default=None),
    session: AsyncSession = Depends(get_db),
):
    try:
        data = ResidentRequestCreate.model_validate_json(payload)
    except ValidationError as exc:  # pragma: no cover - FastAPI handles validation
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors())

    public_id = _generate_public_id()
    jurisdiction = check_jurisdiction(data.location_address)
    priority, department, ai_payload = classify_request(data.description, data.category_code)

    request = ServiceRequest(
        public_id=public_id,
        title=data.title,
        description=data.description,
        category_code=data.category_code,
        submitter_name=data.submitter_name,
        submitter_email=data.submitter_email,
        submitter_phone=data.submitter_phone,
        location_lat=data.location_lat,
        location_lng=data.location_lng,
        location_address=data.location_address,
        jurisdiction=jurisdiction.jurisdiction,
        status=RequestStatus.NEW,
        priority=priority,
        assigned_department=department,
        ai_priority=priority.value,
        ai_department=department,
        external_metadata={
            "jurisdiction_message": jurisdiction.message,
            "jurisdiction_is_external": jurisdiction.is_external,
            "ai_raw_response": ai_payload,
        },
    )

    if initial_photo:
        stored_path = await save_upload_file(initial_photo, f"requests/{public_id}")
        request.initial_photo_path = stored_path
        session.add(
            RequestAttachment(
                request=request,
                file_path=stored_path,
                file_type=AttachmentType.INITIAL,
                label="Initial Photo",
            )
        )

    session.add(request)
    await session.flush()

    for notification in data.notifications:
        session.add(
            NotificationOptIn(
                request_id=request.id,
                method=notification.method,
                target=notification.target,
            )
        )

    session.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=None,
            to_status=RequestStatus.NEW,
            note="Request submitted by resident",
        )
    )

    session.add(
        RequestNote(
            request_id=request.id,
            visibility=NoteVisibility.PUBLIC,
            body="Thank you for your submission. Township staff will review your request soon.",
        )
    )

    await session.commit()
    await session.refresh(request)

    return ResidentRequestSummary.model_validate(request)


@router.get("/requests/{public_id}", response_model=ResidentRequestDetail)
async def get_request(public_id: str, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(ServiceRequest).where(ServiceRequest.public_id == public_id))
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    public_notes = [
        RequestNotePublic(body=note.body, created_at=note.created_at)
        for note in request.notes
        if note.visibility == NoteVisibility.PUBLIC
    ]

    timeline = [
        ResidentTimelineEntry(
            status=history.to_status,
            note=history.note,
            timestamp=history.created_at,
            changed_by=history.changed_by.full_name if history.changed_by else None,
        )
        for history in sorted(request.history, key=lambda h: h.created_at)
    ]

    detail = ResidentRequestDetail(
        public_id=request.public_id,
        title=request.title,
        description=request.description,
        status=request.status,
        priority=request.priority,
        category_code=request.category_code,
        created_at=request.created_at,
        updated_at=request.updated_at,
        jurisdiction=request.jurisdiction,
        assigned_department=request.assigned_department,
        public_notes=public_notes,
        timeline=timeline,
    )
    return detail


@router.get("/jurisdiction", response_model=JurisdictionCheckResponse)
async def jurisdiction_lookup(address: str):
    result = check_jurisdiction(address)
    return JurisdictionCheckResponse(
        jurisdiction=result.jurisdiction,
        message=result.message,
        is_external=result.is_external,
    )


@router.post("/requests/{public_id}/notifications", response_model=ResidentRequestSummary)
async def add_notification_opt_in(
    public_id: str,
    notification: NotificationOptInCreate,
    session: AsyncSession = Depends(get_db),
):
    request = await _get_request_by_public_id(session, public_id)

    if notification.method == NotificationMethod.EMAIL and notification.target == request.submitter_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already subscribed")

    session.add(
        NotificationOptIn(
            request_id=request.id,
            method=notification.method,
            target=notification.target,
        )
    )
    await session.commit()
    await session.refresh(request)
    return ResidentRequestSummary.model_validate(request)


async def _get_request_by_public_id(session: AsyncSession, public_id: str) -> ServiceRequest:
    result = await session.execute(select(ServiceRequest).where(ServiceRequest.public_id == public_id))
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return request
