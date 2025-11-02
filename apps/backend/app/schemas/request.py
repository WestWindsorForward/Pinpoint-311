from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field

from app.core.enums import (
    AttachmentType,
    NoteVisibility,
    NotificationMethod,
    RequestPriority,
    RequestStatus,
)

from .base import ORMModel
from .user import UserRead


class NotificationOptInCreate(ORMModel):
    method: NotificationMethod
    target: str


class ResidentRequestCreate(ORMModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5)
    category_code: str | None = None
    submitter_name: str | None = None
    submitter_email: EmailStr | None = None
    submitter_phone: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    location_address: str | None = None
    notifications: list[NotificationOptInCreate] = Field(default_factory=list)


class ResidentRequestSummary(ORMModel):
    public_id: str
    status: RequestStatus
    priority: RequestPriority
    category_code: str | None
    created_at: datetime
    updated_at: datetime
    jurisdiction: str | None
    assigned_department: str | None


class ResidentTimelineEntry(ORMModel):
    status: RequestStatus
    note: str | None = None
    timestamp: datetime
    changed_by: str | None = None


class RequestNotePublic(ORMModel):
    body: str
    created_at: datetime


class ResidentRequestDetail(ResidentRequestSummary):
    title: str
    description: str
    public_notes: list[RequestNotePublic] = Field(default_factory=list)
    timeline: list[ResidentTimelineEntry] = Field(default_factory=list)


class StaffRequestListItem(ORMModel):
    id: uuid.UUID
    public_id: str
    title: str
    status: RequestStatus
    priority: RequestPriority
    category_code: str | None
    submitter_name: str | None
    created_at: datetime
    assigned_department: str | None
    assigned_to: UserRead | None = None


class StaffRequestDetail(StaffRequestListItem):
    description: str
    submitter_email: EmailStr | None
    submitter_phone: str | None
    location_lat: float | None
    location_lng: float | None
    location_address: str | None
    jurisdiction: str | None
    notes: list["RequestNoteRead"] = Field(default_factory=list)
    attachments: list["AttachmentRead"] = Field(default_factory=list)
    notifications: list["NotificationOptInRead"] = Field(default_factory=list)
    history: list["StatusHistoryRead"] = Field(default_factory=list)


class StatusHistoryRead(ORMModel):
    from_status: RequestStatus | None
    to_status: RequestStatus
    note: str | None
    created_at: datetime
    changed_by: UserRead | None


class RequestNoteCreate(ORMModel):
    body: str = Field(min_length=1)
    visibility: NoteVisibility = NoteVisibility.PUBLIC


class RequestNoteRead(ORMModel):
    id: int
    visibility: NoteVisibility
    body: str
    created_at: datetime
    updated_at: datetime
    author: UserRead | None


class AttachmentRead(ORMModel):
    id: int
    file_path: str
    file_type: AttachmentType
    label: str | None
    created_at: datetime


class NotificationOptInRead(ORMModel):
    id: int
    method: NotificationMethod
    target: str
    is_verified: bool
    created_at: datetime


class RequestStatusUpdate(ORMModel):
    status: RequestStatus
    note: str | None = None


class RequestPriorityUpdate(ORMModel):
    priority: RequestPriority


class RequestAssignmentUpdate(ORMModel):
    assigned_to_id: uuid.UUID | None = None
    assigned_department: str | None = None


class RequestBulkExportFilter(ORMModel):
    status: RequestStatus | None = None
    priority: RequestPriority | None = None
    category_code: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None


class JurisdictionCheckResponse(ORMModel):
    jurisdiction: str | None
    message: str | None
    is_external: bool


StaffRequestDetail.model_rebuild()
RequestNoteRead.model_rebuild()
AttachmentRead.model_rebuild()
NotificationOptInRead.model_rebuild()
StatusHistoryRead.model_rebuild()
