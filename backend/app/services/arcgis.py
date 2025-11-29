from __future__ import annotations

import requests

def fetch_layer_geojson(layer_url: str, where: str | None = None, token: str | None = None) -> dict:
    params = {
        "f": "geojson",
        "where": where or "1=1",
        "outFields": "*",
        "returnGeometry": "true",
    }
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.get(layer_url.rstrip("/") + "/query", params=params, headers=headers, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"ArcGIS query failed: HTTP {resp.status_code}")
    data = resp.json()
    # Some layers may not support f=geojson and return esri JSON; fallback minimal conversion
    if "type" in data and data["type"] == "FeatureCollection":
        return data
    # minimal conversion for esri JSON with polygon rings
    features = []
    for feat in data.get("features", []):
        geom = feat.get("geometry", {})
        rings = geom.get("rings")
        if rings:
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": rings},
                "properties": feat.get("attributes", {}),
            })
    return {"type": "FeatureCollection", "features": features}

