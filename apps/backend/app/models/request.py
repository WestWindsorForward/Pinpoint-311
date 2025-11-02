from __future__ import annotations

import uuid

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AttachmentType,
    NoteVisibility,
    NotificationMethod,
    RequestPriority,
    RequestStatus,
    WebhookDeliveryStatus,
)

from .base import Base, TimestampMixin


class ServiceRequest(Base, TimestampMixin):
    __tablename__ = "requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(12), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus, native_enum=False), default=RequestStatus.NEW)
    priority: Mapped[RequestPriority] = mapped_column(Enum(RequestPriority, native_enum=False), default=RequestPriority.MEDIUM)
    category_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    submitter_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitter_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitter_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    location_lat: Mapped[float | None] = mapped_column(nullable=True)
    location_lng: Mapped[float | None] = mapped_column(nullable=True)
    location_address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    initial_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    completion_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_priority: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    assigned_to: Mapped["User" | None] = relationship(
        "User", back_populates="assigned_requests", foreign_keys=[assigned_to_id], lazy="joined"
    )
    notes: Mapped[list["RequestNote"]] = relationship(
        "RequestNote", back_populates="request", cascade="all, delete-orphan", lazy="selectin"
    )
    history: Mapped[list["RequestStatusHistory"]] = relationship(
        "RequestStatusHistory", back_populates="request", cascade="all, delete-orphan", lazy="selectin"
    )
    attachments: Mapped[list["RequestAttachment"]] = relationship(
        "RequestAttachment", back_populates="request", cascade="all, delete-orphan", lazy="selectin"
    )
    notifications: Mapped[list["NotificationOptIn"]] = relationship(
        "NotificationOptIn", back_populates="request", cascade="all, delete-orphan", lazy="selectin"
    )


class RequestStatusHistory(Base):
    __tablename__ = "request_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    from_status: Mapped[RequestStatus | None] = mapped_column(Enum(RequestStatus, native_enum=False), nullable=True)
    to_status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus, native_enum=False), nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest] = relationship("ServiceRequest", back_populates="history", lazy="selectin")
    changed_by: Mapped["User" | None] = relationship("User", lazy="joined")


class RequestNote(Base, TimestampMixin):
    __tablename__ = "request_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    visibility: Mapped[NoteVisibility] = mapped_column(Enum(NoteVisibility, native_enum=False), default=NoteVisibility.PUBLIC)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    request: Mapped[ServiceRequest] = relationship("ServiceRequest", back_populates="notes", lazy="selectin")
    author: Mapped["User" | None] = relationship("User", lazy="joined")


class RequestAttachment(Base, TimestampMixin):
    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[AttachmentType] = mapped_column(Enum(AttachmentType, native_enum=False), default=AttachmentType.OTHER)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    request: Mapped[ServiceRequest] = relationship("ServiceRequest", back_populates="attachments", lazy="selectin")
    uploaded_by: Mapped["User" | None] = relationship("User", lazy="joined")


class NotificationOptIn(Base, TimestampMixin):
    __tablename__ = "notification_opt_ins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    method: Mapped[NotificationMethod] = mapped_column(Enum(NotificationMethod, native_enum=False), nullable=False)
    target: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    request: Mapped[ServiceRequest] = relationship("ServiceRequest", back_populates="notifications", lazy="selectin")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id"), nullable=True)
    action_type: Mapped[str] = mapped_column(String(128), nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest | None] = relationship("ServiceRequest", lazy="selectin")
    actor: Mapped["User" | None] = relationship("User", lazy="joined")


class WebhookDelivery(Base, TimestampMixin):
    __tablename__ = "webhook_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"))
    target_url: Mapped[str] = mapped_column(String(512), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[WebhookDeliveryStatus] = mapped_column(Enum(WebhookDeliveryStatus, native_enum=False), default=WebhookDeliveryStatus.PENDING)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request: Mapped[ServiceRequest] = relationship("ServiceRequest", lazy="selectin")
