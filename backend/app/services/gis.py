from __future__ import annotations

import logging
from typing import Optional

from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import GeoBoundary

logger = logging.getLogger(__name__)


async def is_point_within_boundary(session: AsyncSession, latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return True  # allow requests without coordinates
    boundary = await _get_active_boundary(session)
    if not boundary:
        return True
    polygon = shape(boundary.geojson)
    return polygon.contains(Point(longitude, latitude))


async def _get_active_boundary(session: AsyncSession) -> Optional[GeoBoundary]:
    result = await session.execute(select(GeoBoundary).where(GeoBoundary.is_active.is_(True)).order_by(GeoBoundary.updated_at.desc()))
    return result.scalar_one_or_none()


async def jurisdiction_warning(session: AsyncSession, latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    inside = await is_point_within_boundary(session, latitude, longitude)
    if inside:
        return None
    return "Location appears to be outside of township jurisdiction. Please confirm responsible agency."
