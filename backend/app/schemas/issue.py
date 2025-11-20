import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.issue import ServicePriority, ServiceStatus


class IssueCategoryBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    default_priority: ServicePriority = ServicePriority.medium
    default_department: str | None = None
    is_active: bool = True


class IssueCategoryCreate(IssueCategoryBase):
    pass


class IssueCategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    default_priority: ServicePriority | None = None
    default_department: str | None = None
    is_active: bool | None = None


class IssueCategoryRead(IssueCategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ServiceRequestBase(BaseModel):
    service_code: str
    description: str
    address_string: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    resident_name: str | None = None
    resident_email: str | None = None
    resident_phone: str | None = None


class ServiceRequestCreate(ServiceRequestBase):
    media_urls: list[str] | None = None


class ServiceRequestRead(ServiceRequestBase):
    id: uuid.UUID
    external_id: str
    priority: ServicePriority
    status: ServiceStatus
    ai_analysis: dict[str, Any] | None = None
    jurisdiction_warning: str | None = None
    category_id: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RequestUpdateRead(BaseModel):
    id: int
    request_id: uuid.UUID
    notes: str
    public: bool
    status_override: ServiceStatus | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
