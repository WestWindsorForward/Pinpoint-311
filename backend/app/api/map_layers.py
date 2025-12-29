from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.session import get_db
from app.models import MapLayer, User
from app.schemas import MapLayerCreate, MapLayerUpdate, MapLayerResponse
from app.core.auth import get_current_admin

router = APIRouter()


@router.get("/", response_model=List[MapLayerResponse])
async def list_public_layers(db: AsyncSession = Depends(get_db)):
    """List all active layers visible on resident portal (public)"""
    result = await db.execute(
        select(MapLayer)
        .where(MapLayer.is_active == True)
        .where(MapLayer.show_on_resident_portal == True)
        .order_by(MapLayer.name)
    )
    return result.scalars().all()


@router.get("/all", response_model=List[MapLayerResponse])
async def list_all_layers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """List all layers including inactive (admin only)"""
    result = await db.execute(
        select(MapLayer).order_by(MapLayer.name)
    )
    return result.scalars().all()


@router.post("/", response_model=MapLayerResponse, status_code=status.HTTP_201_CREATED)
async def create_layer(
    layer_data: MapLayerCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Create a new map layer (admin only)"""
    # Auto-detect layer type from GeoJSON if not provided
    layer_type = layer_data.layer_type
    if not layer_type and layer_data.geojson:
        geojson = layer_data.geojson
        if geojson.get("type") == "FeatureCollection":
            features = geojson.get("features", [])
            if features:
                geom_type = features[0].get("geometry", {}).get("type", "")
                if geom_type in ["Polygon", "MultiPolygon"]:
                    layer_type = "polygon"
                elif geom_type in ["LineString", "MultiLineString"]:
                    layer_type = "line"
                elif geom_type in ["Point", "MultiPoint"]:
                    layer_type = "point"
        elif geojson.get("type") == "Feature":
            geom_type = geojson.get("geometry", {}).get("type", "")
            if geom_type in ["Polygon", "MultiPolygon"]:
                layer_type = "polygon"
            elif geom_type in ["LineString", "MultiLineString"]:
                layer_type = "line"
            elif geom_type in ["Point", "MultiPoint"]:
                layer_type = "point"
    
    layer = MapLayer(
        name=layer_data.name,
        description=layer_data.description,
        layer_type=layer_type,
        fill_color=layer_data.fill_color,
        stroke_color=layer_data.stroke_color,
        fill_opacity=layer_data.fill_opacity,
        stroke_width=layer_data.stroke_width,
        geojson=layer_data.geojson,
        show_on_resident_portal=layer_data.show_on_resident_portal,
    )
    
    db.add(layer)
    await db.commit()
    await db.refresh(layer)
    return layer


@router.get("/{layer_id}", response_model=MapLayerResponse)
async def get_layer(layer_id: int, db: AsyncSession = Depends(get_db)):
    """Get a layer by ID"""
    result = await db.execute(
        select(MapLayer).where(MapLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")
    return layer


@router.put("/{layer_id}", response_model=MapLayerResponse)
async def update_layer(
    layer_id: int,
    layer_data: MapLayerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Update a map layer (admin only)"""
    result = await db.execute(
        select(MapLayer).where(MapLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")
    
    # Update fields
    if layer_data.name is not None:
        layer.name = layer_data.name
    if layer_data.description is not None:
        layer.description = layer_data.description
    if layer_data.fill_color is not None:
        layer.fill_color = layer_data.fill_color
    if layer_data.stroke_color is not None:
        layer.stroke_color = layer_data.stroke_color
    if layer_data.fill_opacity is not None:
        layer.fill_opacity = layer_data.fill_opacity
    if layer_data.stroke_width is not None:
        layer.stroke_width = layer_data.stroke_width
    if layer_data.is_active is not None:
        layer.is_active = layer_data.is_active
    if layer_data.show_on_resident_portal is not None:
        layer.show_on_resident_portal = layer_data.show_on_resident_portal
    if layer_data.geojson is not None:
        layer.geojson = layer_data.geojson
    
    await db.commit()
    await db.refresh(layer)
    return layer


@router.delete("/{layer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layer(
    layer_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Delete a map layer (admin only)"""
    result = await db.execute(
        select(MapLayer).where(MapLayer.id == layer_id)
    )
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")
    
    await db.delete(layer)
    await db.commit()
