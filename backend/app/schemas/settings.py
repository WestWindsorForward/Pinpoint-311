from typing import Any

from pydantic import BaseModel


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
