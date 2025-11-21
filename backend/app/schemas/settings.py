from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.settings import BoundaryKind

class BrandingUpdate(BaseModel):
    town_name: str | None = None
    hero_text: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None


class SecretsPayload(BaseModel):
    provider: str
    key: str
    secret: str
    metadata: dict[str, Any] | None = None


class GeoBoundaryUpload(BaseModel):
    name: str = "primary"
    geojson: dict[str, Any]
    kind: BoundaryKind = BoundaryKind.primary
    redirect_url: str | None = None
    notes: str | None = None


class GeoBoundaryRead(GeoBoundaryUpload):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RuntimeConfigUpdate(BaseModel):
    google_maps_api_key: str | None = None
    vertex_ai_project: str | None = None
    vertex_ai_location: str | None = None
    vertex_ai_model: str | None = None
    developer_report_email: str | None = None
    rate_limit_resident_per_minute: int | None = None
    rate_limit_public_per_minute: int | None = None
    otel_enabled: bool | None = None
    otel_endpoint: str | None = None
    otel_headers: str | None = None
