import enum
import uuid

from sqlalchemy import Boolean, Enum, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class BrandingAsset(Base, TimestampMixin):
    __tablename__ = "branding_assets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    file_path: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str | None] = mapped_column(String(128))


class TownshipSetting(Base, TimestampMixin):
    __tablename__ = "township_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class BoundaryKind(str, enum.Enum):
    primary = "primary"
    exclusion = "exclusion"


class JurisdictionLevel(str, enum.Enum):
    township = "township"
    county = "county"
    state = "state"
    federal = "federal"
    other = "other"


class GeoBoundary(Base, TimestampMixin):
    __tablename__ = "geo_boundaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), default="primary")
    geojson: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    kind: Mapped[BoundaryKind] = mapped_column(Enum(BoundaryKind), default=BoundaryKind.primary)
    jurisdiction: Mapped[JurisdictionLevel | None] = mapped_column(Enum(JurisdictionLevel), nullable=True)
    redirect_url: Mapped[str | None] = mapped_column(String(512))
    notes: Mapped[str | None] = mapped_column(Text)
    service_code_filters: Mapped[list[str]] = mapped_column(JSON, default=list)
    road_name_filters: Mapped[list[str]] = mapped_column(JSON, default=list)


class ApiCredential(Base, TimestampMixin):
    __tablename__ = "api_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(128))
    key: Mapped[str] = mapped_column(String(128))
    secret: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)


class NotificationTemplate(Base, TimestampMixin):
    __tablename__ = "notification_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(64), default="email")


class OutboundWebhookEndpoint(Base, TimestampMixin):
    __tablename__ = "outbound_webhooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128))
    url: Mapped[str] = mapped_column(String(512))
    secret: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
