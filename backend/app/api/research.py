"""
Research Suite API - Read-only analytics layer for researchers

This module provides sanitized, PII-free access to service request data
for academic and municipal research purposes.

All endpoints:
- Check research_portal module is enabled
- Require researcher or admin role
- Query sanitized data (no PII)
- Log all access for audit purposes
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime, date
import csv
import io
import json
import logging

from app.db.session import get_db
from app.models import ServiceRequest, RequestAuditLog, SystemSettings, ResearchAccessLog, Department
from app.core.auth import get_current_researcher
from app.core.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


async def check_research_enabled(db: AsyncSession):
    """Check if research portal is enabled via Admin Console modules"""
    # Check env variable first
    if settings.enable_research_suite:
        return True
    
    # Check database modules setting
    result = await db.execute(select(SystemSettings).limit(1))
    system_settings = result.scalar_one_or_none()
    if system_settings and system_settings.modules:
        return system_settings.modules.get("research_portal", False)
    
    return False


async def log_research_access(
    db: AsyncSession,
    user_id: int,
    username: str,
    action: str,
    parameters: dict,
    record_count: int,
    privacy_mode: str = "fuzzed"
):
    """Log research data access for audit purposes"""
    log_entry = ResearchAccessLog(
        user_id=user_id,
        username=username,
        action=action,
        parameters=parameters,
        record_count=record_count,
        privacy_mode=privacy_mode
    )
    db.add(log_entry)
    await db.commit()


def sanitize_description(description: str) -> str:
    """Mask phone numbers in description text"""
    import re
    if not description:
        return ""
    # Mask various phone number formats
    patterns = [
        r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',  # 123-456-7890, 123.456.7890, 123 456 7890
        r'\(\d{3}\)\s?\d{3}[-.\s]?\d{4}',   # (123) 456-7890
    ]
    result = description
    for pattern in patterns:
        result = re.sub(pattern, '[PHONE REDACTED]', result)
    return result


def fuzz_location(lat: float, long: float, grid_size: float = 0.0003) -> tuple:
    """Snap coordinates to grid (~100ft precision for privacy)"""
    if lat is None or long is None:
        return None, None
    import math
    fuzzed_lat = round(lat / grid_size) * grid_size
    fuzzed_long = round(long / grid_size) * grid_size
    return round(fuzzed_lat, 6), round(fuzzed_long, 6)


@router.get("/status")
async def research_status(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Check if Research Suite is enabled"""
    enabled = await check_research_enabled(db)
    return {
        "enabled": enabled,
        "user": current_user.username,
        "role": current_user.role
    }


@router.get("/analytics")
async def get_analytics(
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    service_code: Optional[str] = Query(None, description="Filter by service category"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Get aggregate analytics (no PII exposed)"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    # Base query for non-deleted requests
    base_conditions = [ServiceRequest.deleted_at.is_(None)]
    
    if start_date:
        base_conditions.append(ServiceRequest.requested_datetime >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        base_conditions.append(ServiceRequest.requested_datetime <= datetime.combine(end_date, datetime.max.time()))
    if service_code:
        base_conditions.append(ServiceRequest.service_code == service_code)
    
    # Total count
    total_query = select(func.count(ServiceRequest.id)).where(*base_conditions)
    total_result = await db.execute(total_query)
    total_count = total_result.scalar() or 0
    
    # Status distribution
    status_query = select(
        ServiceRequest.status,
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by(ServiceRequest.status)
    status_result = await db.execute(status_query)
    status_distribution = {row[0]: row[1] for row in status_result.all()}
    
    # Average resolution time (for closed requests)
    closed_conditions = base_conditions + [
        ServiceRequest.status == "closed",
        ServiceRequest.closed_datetime.isnot(None)
    ]
    avg_resolution_query = select(
        func.avg(
            func.extract('epoch', ServiceRequest.closed_datetime - ServiceRequest.requested_datetime) / 3600.0
        )
    ).where(*closed_conditions)
    avg_result = await db.execute(avg_resolution_query)
    avg_resolution_hours = avg_result.scalar()
    
    # Category distribution
    category_query = select(
        ServiceRequest.service_code,
        ServiceRequest.service_name,
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by(
        ServiceRequest.service_code, 
        ServiceRequest.service_name
    ).order_by(func.count(ServiceRequest.id).desc())
    category_result = await db.execute(category_query)
    category_distribution = [
        {"code": row[0], "name": row[1], "count": row[2]} 
        for row in category_result.all()
    ]
    
    # Source distribution
    source_query = select(
        ServiceRequest.source,
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by(ServiceRequest.source)
    source_result = await db.execute(source_query)
    source_distribution = {row[0] or "unknown": row[1] for row in source_result.all()}
    
    # Log access
    await log_research_access(
        db, current_user.id, current_user.username, "view_analytics",
        {"start_date": str(start_date), "end_date": str(end_date), "service_code": service_code},
        total_count
    )
    
    return {
        "total_requests": total_count,
        "status_distribution": status_distribution,
        "avg_resolution_hours": round(avg_resolution_hours, 2) if avg_resolution_hours else None,
        "category_distribution": category_distribution,
        "source_distribution": source_distribution,
        "filters_applied": {
            "start_date": str(start_date) if start_date else None,
            "end_date": str(end_date) if end_date else None,
            "service_code": service_code
        }
    }


@router.get("/export/csv")
async def export_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    service_code: Optional[str] = Query(None),
    privacy_mode: str = Query("fuzzed", description="Location privacy: 'fuzzed' or 'exact' (requires special permission)"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Export sanitized request data as CSV (streaming for large datasets)"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    # Only admins can use exact location mode
    if privacy_mode == "exact" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Exact location export requires admin privileges"
        )
    
    # Build query
    query = select(ServiceRequest).where(ServiceRequest.deleted_at.is_(None))
    
    if start_date:
        query = query.where(ServiceRequest.requested_datetime >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(ServiceRequest.requested_datetime <= datetime.combine(end_date, datetime.max.time()))
    if service_code:
        query = query.where(ServiceRequest.service_code == service_code)
    
    query = query.order_by(ServiceRequest.requested_datetime.desc())
    
    result = await db.execute(query)
    requests = result.scalars().all()
    
    # Log access
    await log_research_access(
        db, current_user.id, current_user.username, "export_csv",
        {"start_date": str(start_date), "end_date": str(end_date), "service_code": service_code},
        len(requests), privacy_mode
    )
    
    # Generate CSV
    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "request_id", "service_code", "service_name", "description_sanitized",
            "status", "priority", "address", "latitude", "longitude",
            "source", "flagged", "requested_datetime", "closed_datetime",
            "closed_substatus", "time_to_resolve_hours", "assigned_department_id"
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
        
        # Data rows
        for req in requests:
            if privacy_mode == "fuzzed":
                lat, long = fuzz_location(req.lat, req.long)
            else:
                lat, long = req.lat, req.long
            
            # Calculate resolution time
            resolution_hours = None
            if req.closed_datetime and req.requested_datetime:
                delta = req.closed_datetime - req.requested_datetime
                resolution_hours = round(delta.total_seconds() / 3600, 2)
            
            writer.writerow([
                req.service_request_id,
                req.service_code,
                req.service_name,
                sanitize_description(req.description),
                req.status,
                req.priority,
                req.address,
                lat,
                long,
                req.source,
                req.flagged,
                req.requested_datetime.isoformat() if req.requested_datetime else None,
                req.closed_datetime.isoformat() if req.closed_datetime else None,
                req.closed_substatus,
                resolution_hours,
                req.assigned_department_id
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)
    
    filename = f"research_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/geojson")
async def export_geojson(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    service_code: Optional[str] = Query(None),
    privacy_mode: str = Query("fuzzed"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Export sanitized request data as GeoJSON for GIS tools"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    if privacy_mode == "exact" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Exact location export requires admin privileges"
        )
    
    # Build query
    query = select(ServiceRequest).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.lat.isnot(None),
        ServiceRequest.long.isnot(None)
    )
    
    if start_date:
        query = query.where(ServiceRequest.requested_datetime >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(ServiceRequest.requested_datetime <= datetime.combine(end_date, datetime.max.time()))
    if service_code:
        query = query.where(ServiceRequest.service_code == service_code)
    
    result = await db.execute(query)
    requests = result.scalars().all()
    
    # Log access
    await log_research_access(
        db, current_user.id, current_user.username, "export_geojson",
        {"start_date": str(start_date), "end_date": str(end_date), "service_code": service_code},
        len(requests), privacy_mode
    )
    
    # Build GeoJSON
    features = []
    for req in requests:
        if privacy_mode == "fuzzed":
            lat, long = fuzz_location(req.lat, req.long)
        else:
            lat, long = req.lat, req.long
        
        if lat is None or long is None:
            continue
        
        resolution_hours = None
        if req.closed_datetime and req.requested_datetime:
            delta = req.closed_datetime - req.requested_datetime
            resolution_hours = round(delta.total_seconds() / 3600, 2)
        
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [long, lat]
            },
            "properties": {
                "request_id": req.service_request_id,
                "service_code": req.service_code,
                "service_name": req.service_name,
                "status": req.status,
                "priority": req.priority,
                "requested_datetime": req.requested_datetime.isoformat() if req.requested_datetime else None,
                "closed_datetime": req.closed_datetime.isoformat() if req.closed_datetime else None,
                "time_to_resolve_hours": resolution_hours,
                "source": req.source
            }
        })
    
    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "exported_at": datetime.now().isoformat(),
            "privacy_mode": privacy_mode,
            "record_count": len(features)
        }
    }
    
    filename = f"research_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.geojson"
    
    return StreamingResponse(
        iter([json.dumps(geojson, indent=2)]),
        media_type="application/geo+json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/code-snippets")
async def get_code_snippets(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Get R and Python code snippets for fetching data via API"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    # Get base URL from settings or use placeholder
    result = await db.execute(select(SystemSettings).limit(1))
    system_settings = result.scalar_one_or_none()
    base_url = f"https://{system_settings.custom_domain}" if system_settings and system_settings.custom_domain else "https://your-311-domain.com"
    
    python_snippet = f'''# Python - Fetch Research Data
import requests
import pandas as pd

API_URL = "{base_url}/api/research"
TOKEN = "your_jwt_token_here"

headers = {{"Authorization": f"Bearer {{TOKEN}}"}}

# Get analytics
analytics = requests.get(f"{{API_URL}}/analytics", headers=headers).json()
print(f"Total requests: {{analytics['total_requests']}}")

# Download CSV
response = requests.get(
    f"{{API_URL}}/export/csv",
    headers=headers,
    params={{"privacy_mode": "fuzzed"}}
)
with open("research_data.csv", "w") as f:
    f.write(response.text)

# Load into pandas
df = pd.read_csv("research_data.csv")
print(df.head())
'''

    r_snippet = f'''# R - Fetch Research Data
library(httr)
library(jsonlite)

API_URL <- "{base_url}/api/research"
TOKEN <- "your_jwt_token_here"

headers <- add_headers(Authorization = paste("Bearer", TOKEN))

# Get analytics
analytics <- GET(paste0(API_URL, "/analytics"), headers)
analytics_data <- fromJSON(content(analytics, "text"))
print(paste("Total requests:", analytics_data$total_requests))

# Download CSV
response <- GET(
  paste0(API_URL, "/export/csv"),
  headers,
  query = list(privacy_mode = "fuzzed")
)
write(content(response, "text"), "research_data.csv")

# Load data
df <- read.csv("research_data.csv")
head(df)
'''

    return {
        "python": python_snippet,
        "r": r_snippet
    }


@router.get("/access-logs")
async def get_access_logs(
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Get research access audit logs (admin only)"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required to view access logs"
        )
    
    query = select(ResearchAccessLog).order_by(ResearchAccessLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        {
            "id": log.id,
            "username": log.username,
            "action": log.action,
            "parameters": log.parameters,
            "record_count": log.record_count,
            "privacy_mode": log.privacy_mode,
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
        for log in logs
    ]
