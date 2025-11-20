from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

from app.models.issue import ServicePriority, ServiceStatus


class Open311Service(BaseModel):
    service_code: str
    service_name: str
    description: str | None = None
    group: str | None = None
    keywords: list[str] | None = None
    type: str = "realtime"


class Open311ServiceDefinition(BaseModel):
    service_code: str
    attributes: list[dict[str, Any]]


class Open311Request(BaseModel):
    service_request_id: str
    service_notice: str | None = None
    status: ServiceStatus
    status_notes: str | None = None
    service_name: str
    service_code: str
    description: str
    agency_responsible: str | None = None
    service_address: str | None = None
    requested_datetime: datetime
    updated_datetime: datetime
    expected_datetime: datetime | None = None
    priority: ServicePriority
    lat: float | None = None
    long: float | None = None
    media_url: list[str] | None = None


class Open311Error(BaseModel):
    code: str
    description: str


class Open311RequestCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    service_code: str
    description: str
    lat: float | None = Field(None, alias="lat")
    long: float | None = Field(None, alias="long")
    address_string: str | None = None
    email: str | None = None
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    media_url: list[str] | None = None
