from __future__ import annotations

import logging
from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import BoundaryKind, GeoBoundary, CategoryExclusion, RoadExclusion

logger = logging.getLogger(__name__)


async def evaluate_location(
    session: AsyncSession,
    latitude: float | None,
    longitude: float | None,
    *,
    service_code: str | None = None,
) -> tuple[bool, str | None]:
    """Returns (allowed, warning)."""
    if latitude is None or longitude is None:
        return True, None
    point = Point(longitude, latitude)

    primaries = await _get_boundaries(session, BoundaryKind.primary)
    if primaries:
        inside_primary = any(_contains(boundary, point) for boundary in primaries)
        if not inside_primary:
            return False, "Location is outside the township service boundary."

    exclusions = await _get_boundaries(session, BoundaryKind.exclusion)
    for boundary in exclusions:
        if _contains(boundary, point):
            if _exclusion_applies(boundary, service_code):
                return False, _build_exclusion_message(boundary)
            warning = _build_exclusion_message(boundary)
            return True, warning

    return True, None


async def evaluate_road_filters(
    session: AsyncSession,
    *,
    address_string: str | None,
    service_code: str | None = None,
) -> tuple[bool, str | None]:
    """Evaluate boundary exclusions based on road name filters.
    If an exclusion boundary has `road_name_filters` matching the address string,
    apply exclusion (or warning when filters don't apply)."""
    if not address_string:
        return True, None
    text = address_string.lower()
    result = await session.execute(select(GeoBoundary).where(GeoBoundary.is_active.is_(True)))
    boundaries = result.scalars().all()
    for boundary in boundaries:
        names = getattr(boundary, "road_name_filters", None) or []
        if not names:
            continue
        match = any(name.lower() in text for name in names)
        if not match:
            continue
        if boundary.kind == BoundaryKind.exclusion:
            if _exclusion_applies(boundary, service_code):
                return False, _build_exclusion_message(boundary)
            warning = _build_exclusion_message(boundary)
            return True, warning
    return True, None


async def evaluate_category_exclusions(session: AsyncSession, *, service_code: str | None) -> tuple[bool, str | None]:
    if not service_code:
        return True, None
    result = await session.execute(select(CategoryExclusion).where(CategoryExclusion.is_active.is_(True), CategoryExclusion.category_slug == service_code))
    rows = result.scalars().all()
    if not rows:
        return True, None
    msg = _build_redirect(rows[0].redirect_name, rows[0].redirect_url, rows[0].redirect_message)
    return False, msg


async def evaluate_road_exclusions(session: AsyncSession, *, address_string: str | None) -> tuple[bool, str | None]:
    if not address_string:
        return True, None
    text = address_string.lower()
    result = await session.execute(select(RoadExclusion).where(RoadExclusion.is_active.is_(True)))
    rows = result.scalars().all()
    for row in rows:
        if row.road_name.lower() in text:
            msg = _build_redirect(row.redirect_name, row.redirect_url, row.redirect_message)
            return False, msg
    return True, None


async def is_point_within_boundary(
    session: AsyncSession,
    latitude: float | None,
    longitude: float | None,
    service_code: str | None = None,
) -> bool:
    allowed, _ = await evaluate_location(session, latitude, longitude, service_code=service_code)
    return allowed


async def jurisdiction_warning(
    session: AsyncSession,
    latitude: float | None,
    longitude: float | None,
    service_code: str | None = None,
) -> str | None:
    _, warning = await evaluate_location(session, latitude, longitude, service_code=service_code)
    return warning


async def _get_boundaries(session: AsyncSession, kind: BoundaryKind) -> list[GeoBoundary]:
    result = await session.execute(
        select(GeoBoundary)
            .where(GeoBoundary.kind == kind, GeoBoundary.is_active.is_(True))
            .order_by(GeoBoundary.updated_at.desc())
    )
    return result.scalars().all()


def _contains(boundary: GeoBoundary, point: Point) -> bool:
    try:
        polygon = shape(boundary.geojson)
        return polygon.contains(point)
    except Exception as exc:  # pragma: no cover - log corrupt shapes
        logger.warning("Failed to evaluate boundary %s: %s", boundary.id, exc)
        return False


def _build_exclusion_message(boundary: GeoBoundary) -> str:
    scope = boundary.jurisdiction.value if getattr(boundary, "jurisdiction", None) else "another jurisdiction"
    name = boundary.name or scope
    base = boundary.notes or f"This location is handled by {name} ({scope})."
    if boundary.redirect_url:
        base = f"{base} Visit {boundary.redirect_url} for the correct reporting portal."
    return base


def _build_redirect(name: str | None, url: str | None, message: str | None) -> str:
    parts: list[str] = []
    if message:
        parts.append(message)
    if name and url:
        parts.append(f"Report to {name}: {url}")
    elif url:
        parts.append(f"Report here: {url}")
    elif name:
        parts.append(f"Report to {name}")
    return " ".join(parts) if parts else "This request should be redirected."


def _exclusion_applies(boundary: GeoBoundary, service_code: str | None) -> bool:
    filters = getattr(boundary, "service_code_filters", None) or []
    if not filters:
        return True
    if not service_code:
        return False
    return service_code in filters
