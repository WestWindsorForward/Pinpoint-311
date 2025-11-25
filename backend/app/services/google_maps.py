from __future__ import annotations

from typing import Any, Tuple

import httpx

from app.core.config import settings

GOOGLE_FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


class GoogleMapsError(RuntimeError):
    pass


async def fetch_boundary_from_google(*, query: str | None, place_id: str | None) -> Tuple[str, dict[str, Any]]:
    """Get a rough polygon for a place or road using Google Maps APIs."""
    api_key = settings.google_maps_api_key
    if not api_key:
        raise GoogleMapsError("Google Maps API key is not configured.")

    async with httpx.AsyncClient(timeout=20) as client:
        resolved_place_id = place_id
        if not resolved_place_id and query:
            resolved_place_id = await _lookup_place_id(client, query, api_key)

        if resolved_place_id:
            return await _polygon_from_place_details(client, resolved_place_id, api_key)

        if query:
            return await _polygon_from_geocode(client, query, api_key)

        raise GoogleMapsError("Unable to resolve Google Maps boundary for the provided query.")


async def _lookup_place_id(client: httpx.AsyncClient, query: str, api_key: str) -> str | None:
    params = {
        "key": api_key,
        "input": query,
        "inputtype": "textquery",
        "fields": "place_id",
    }
    response = await client.get(GOOGLE_FIND_PLACE_URL, params=params)
    data = response.json()
    candidates = data.get("candidates") or []
    if candidates:
        return candidates[0].get("place_id")
    return None


async def _polygon_from_place_details(
    client: httpx.AsyncClient, place_id: str, api_key: str
) -> Tuple[str, dict[str, Any]]:
    params = {
        "key": api_key,
        "place_id": place_id,
        "fields": "geometry,name",
    }
    response = await client.get(GOOGLE_PLACE_DETAILS_URL, params=params)
    data = response.json()
    if data.get("status") != "OK":
        raise GoogleMapsError(f"Google Places lookup failed: {data.get('status')}")
    result = data.get("result") or {}
    geometry = result.get("geometry")
    if not geometry:
        raise GoogleMapsError("Google Places response did not include geometry.")
    polygon = _polygon_from_geometry(geometry)
    return result.get("name", "Google Boundary"), polygon


async def _polygon_from_geocode(client: httpx.AsyncClient, query: str, api_key: str) -> Tuple[str, dict[str, Any]]:
    params = {"address": query, "key": api_key}
    response = await client.get(GOOGLE_GEOCODE_URL, params=params)
    data = response.json()
    results = data.get("results") or []
    if not results:
        raise GoogleMapsError("Google Geocode did not return any results.")
    geometry = results[0].get("geometry")
    if not geometry:
        raise GoogleMapsError("Google Geocode response missing geometry.")
    polygon = _polygon_from_geometry(geometry)
    return results[0].get("formatted_address", query), polygon


def _polygon_from_geometry(geometry: dict[str, Any]) -> dict[str, Any]:
    bounds = geometry.get("bounds") or geometry.get("viewport")
    if bounds:
        sw = bounds["southwest"]
        ne = bounds["northeast"]
        coordinates = [
            [sw["lng"], sw["lat"]],
            [ne["lng"], sw["lat"]],
            [ne["lng"], ne["lat"]],
            [sw["lng"], ne["lat"]],
            [sw["lng"], sw["lat"]],
        ]
        return {"type": "Polygon", "coordinates": [coordinates]}

    location = geometry.get("location")
    if location:
        delta = 0.005
        lat = location["lat"]
        lng = location["lng"]
        coordinates = [
            [lng - delta, lat - delta],
            [lng + delta, lat - delta],
            [lng + delta, lat + delta],
            [lng - delta, lat + delta],
            [lng - delta, lat - delta],
        ]
        return {"type": "Polygon", "coordinates": [coordinates]}

    raise GoogleMapsError("Unable to derive polygon from Google geometry.")
