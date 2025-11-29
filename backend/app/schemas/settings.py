from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.settings import BoundaryKind, JurisdictionLevel

class BrandingUpdate(BaseModel):
    town_name: str | None = None
    site_title: str | None = None
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
    jurisdiction: JurisdictionLevel | None = None
    redirect_url: str | None = None
    notes: str | None = None
    service_code_filters: list[str] = Field(default_factory=list)
    road_name_filters: list[str] = Field(default_factory=list)


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


class GeoBoundaryGoogleImport(BaseModel):
    query: str | None = None
    place_id: str | None = None
    name: str | None = None
    kind: BoundaryKind = BoundaryKind.primary
    jurisdiction: JurisdictionLevel | None = None
    redirect_url: str | None = None
    notes: str | None = None
    service_code_filters: list[str] | None = None
    road_name_filters: list[str] | None = None

    @model_validator(mode="after")
    def _ensure_source(self) -> "GeoBoundaryGoogleImport":
        if not self.place_id and not self.query:
            raise ValueError("Provide either place_id or query")
        return self


class ArcGISLayerImport(BaseModel):
    layer_url: str
    where: str | None = None
    name: str | None = None
    kind: BoundaryKind = BoundaryKind.primary
    jurisdiction: JurisdictionLevel | None = None
    redirect_url: str | None = None
    notes: str | None = None
    service_code_filters: list[str] | None = None
    road_name_filters: list[str] | None = None


class CategoryExclusionCreate(BaseModel):
    category_slug: str
    redirect_name: str | None = None
    redirect_url: str | None = None
    redirect_message: str | None = None
    is_active: bool = True


class CategoryExclusionUpdate(BaseModel):
    category_slug: str | None = None
    redirect_name: str | None = None
    redirect_url: str | None = None
    redirect_message: str | None = None
    is_active: bool | None = None


class CategoryExclusionRead(CategoryExclusionCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoadExclusionCreate(BaseModel):
    road_name: str
    redirect_name: str | None = None
    redirect_url: str | None = None
    redirect_message: str | None = None
    is_active: bool = True


class RoadExclusionUpdate(BaseModel):
    road_name: str | None = None
    redirect_name: str | None = None
    redirect_url: str | None = None
    redirect_message: str | None = None
    is_active: bool | None = None


class RoadExclusionRead(RoadExclusionCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
