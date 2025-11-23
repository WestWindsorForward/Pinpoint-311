from __future__ import annotations

import logging
from typing import Optional

from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import BoundaryKind, GeoBoundary

logger = logging.getLogger(__name__)


async def evaluate_location(
    session: AsyncSession, latitude: float | None, longitude: float | None
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
            return False, _build_exclusion_message(boundary)

    return True, None


async def is_point_within_boundary(session: AsyncSession, latitude: float | None, longitude: float | None) -> bool:
    allowed, _ = await evaluate_location(session, latitude, longitude)
    return allowed


async def jurisdiction_warning(session: AsyncSession, latitude: float | None, longitude: float | None) -> str | None:
    _, warning = await evaluate_location(session, latitude, longitude)
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
