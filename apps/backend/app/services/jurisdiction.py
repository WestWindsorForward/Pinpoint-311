from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from slugify import slugify

from app.core.config import AppConfiguration, get_settings


@dataclass
class JurisdictionResult:
    jurisdiction: str | None
    is_external: bool
    matched_road: str | None = None
    message: str | None = None


settings = get_settings()
config: AppConfiguration = settings.township_config  # type: ignore[assignment]


def normalize_street(value: str) -> str:
    return slugify(value or "", separator=" ")


def check_jurisdiction(street_address: str | None) -> JurisdictionResult:
    if not street_address:
        return JurisdictionResult(jurisdiction=None, is_external=False, message="No address provided")

    normalized = normalize_street(street_address)
    township_roads = _township_roads()

    if any(normalized.find(road) >= 0 for road in township_roads):
        return JurisdictionResult(jurisdiction=config.township.name, is_external=False)

    for jurisdiction in config.jurisdictions:
        for road in jurisdiction.roads:
            candidate = normalize_street(road)
            if candidate and normalized.find(candidate) >= 0:
                message = (
                    f"This location is maintained by {jurisdiction.name} ({jurisdiction.type}). "
                    "Your request will be forwarded if possible, but consider reporting directly."
                )
                return JurisdictionResult(
                    jurisdiction=jurisdiction.name,
                    is_external=True,
                    matched_road=road,
                    message=message,
                )

    return JurisdictionResult(jurisdiction=config.township.name, is_external=False)


def _township_roads() -> Iterable[str]:
    township_roads = []
    for jurisdiction in config.jurisdictions:
        if jurisdiction.type.lower() == "township":
            township_roads.extend(jurisdiction.roads)
    return [normalize_street(r) for r in township_roads if r]
