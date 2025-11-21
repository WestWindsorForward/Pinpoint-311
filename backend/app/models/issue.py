import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class ServicePriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ServiceStatus(str, enum.Enum):
    received = "received"
    triaging = "triaging"
    assigned = "assigned"
    in_progress = "in_progress"
    waiting_external = "waiting_external"
    resolved = "resolved"
    closed = "closed"


class IssueCategory(Base, TimestampMixin):
    __tablename__ = "issue_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    default_priority: Mapped[ServicePriority] = mapped_column(Enum(ServicePriority), default=ServicePriority.medium)
    default_department: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    requests = relationship("ServiceRequest", back_populates="category")


class ServiceRequest(Base, TimestampMixin):
    __tablename__ = "service_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    service_code: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[ServiceStatus] = mapped_column(Enum(ServiceStatus), default=ServiceStatus.received)
    priority: Mapped[ServicePriority] = mapped_column(Enum(ServicePriority), default=ServicePriority.medium)
    description: Mapped[str] = mapped_column(Text)
    address_string: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    jurisdiction_warning: Mapped[str | None] = mapped_column(Text)

    resident_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("issue_categories.id"))
    assigned_department: Mapped[str | None] = mapped_column(String(255))
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    ai_analysis: Mapped[dict | None] = mapped_column(JSON)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    category = relationship("IssueCategory", back_populates="requests")
    resident = relationship("User", foreign_keys=[resident_id], back_populates="submitted_requests")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    updates = relationship("RequestUpdate", back_populates="request", cascade="all,delete-orphan")
    attachments = relationship("RequestAttachment", back_populates="request", cascade="all,delete-orphan")


class RequestUpdate(Base, TimestampMixin):
    __tablename__ = "request_updates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes: Mapped[str] = mapped_column(Text)
    public: Mapped[bool] = mapped_column(Boolean, default=True)
    status_override: Mapped[ServiceStatus | None] = mapped_column(Enum(ServiceStatus))

    request = relationship("ServiceRequest", back_populates="updates")


class RequestAttachment(Base, TimestampMixin):
    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"))
    file_path: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str | None] = mapped_column(String(128))
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_completion_photo: Mapped[bool] = mapped_column(Boolean, default=False)

    request = relationship("ServiceRequest", back_populates="attachments")
