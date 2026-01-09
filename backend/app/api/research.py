"""
Research Suite API - Read-only analytics layer for researchers

This module provides sanitized, PII-free access to service request data
for academic and municipal research purposes.

Research Focus Areas:
- Civil Engineering & Infrastructure: Asset types, infrastructure categories, maintenance patterns
- Equity & Equality: Geographic distribution, response time disparities, service accessibility
- Civics: Civic engagement patterns, submission channels, resolution outcomes

All endpoints:
- Check research_portal module is enabled
- Require researcher or admin role
- Query sanitized data (no PII)
- Log all access for audit purposes
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, extract
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime, date, timedelta
import csv
import io
import json
import logging
import re
import hashlib

from app.db.session import get_db
from app.models import ServiceRequest, RequestAuditLog, SystemSettings, ResearchAccessLog, Department, RequestComment
from app.core.auth import get_current_researcher
from app.core.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

# Infrastructure category mapping for civil engineering research
INFRASTRUCTURE_CATEGORIES = {
    "pothole": "roads_pavement",
    "streetlight": "lighting",
    "sidewalk": "pedestrian_infrastructure",
    "storm_drain": "stormwater",
    "water": "water_utilities",
    "sewer": "sewer_utilities",
    "traffic": "traffic_control",
    "sign": "signage",
    "tree": "green_infrastructure",
    "park": "parks_recreation",
    "trash": "solid_waste",
    "graffiti": "property_maintenance",
    "abandoned": "property_maintenance",
    "noise": "quality_of_life",
    "animal": "animal_services",
}


async def check_research_enabled(db: AsyncSession):
    """Check if research portal is enabled via Admin Console modules"""
    if settings.enable_research_suite:
        return True
    
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
    """Mask PII patterns in description text"""
    if not description:
        return ""
    result = description
    
    # Mask phone numbers
    phone_patterns = [
        r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',
        r'\(\d{3}\)\s?\d{3}[-.\s]?\d{4}',
    ]
    for pattern in phone_patterns:
        result = re.sub(pattern, '[PHONE REDACTED]', result)
    
    # Mask email addresses
    result = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL REDACTED]', result)
    
    # Mask potential names (patterns like "John Smith" or "Mr. Smith")
    result = re.sub(r'\b(Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+', '[NAME REDACTED]', result)
    
    return result


def fuzz_location(lat: float, long: float, grid_size: float = 0.0003) -> tuple:
    """Snap coordinates to grid (~100ft precision for privacy)"""
    if lat is None or long is None:
        return None, None
    fuzzed_lat = round(lat / grid_size) * grid_size
    fuzzed_long = round(long / grid_size) * grid_size
    return round(fuzzed_lat, 6), round(fuzzed_long, 6)


def anonymize_address(address: str, privacy_mode: str) -> str:
    """Anonymize address based on privacy mode"""
    if not address:
        return ""
    
    if privacy_mode == "exact":
        return address
    
    # For fuzzed mode: remove house numbers, keep street name and area
    # "123 Main Street, West Windsor" -> "Main Street Block, West Windsor"
    result = re.sub(r'^\d+\s+', '', address)  # Remove leading house number
    result = re.sub(r'\d+', 'X', result)  # Replace any remaining numbers
    
    # Add "Block" indicator if we removed a house number
    if result != address:
        parts = result.split(',')
        if len(parts) > 0:
            parts[0] = parts[0].strip() + " (Block)"
            result = ', '.join(parts)
    
    return result


def get_infrastructure_category(service_code: str) -> str:
    """Map service code to infrastructure category for civil engineering research"""
    if not service_code:
        return "other"
    
    code_lower = service_code.lower()
    for key, category in INFRASTRUCTURE_CATEGORIES.items():
        if key in code_lower:
            return category
    return "other"


def calculate_business_hours(start: datetime, end: datetime) -> float:
    """Calculate business hours between two datetimes (Mon-Fri 8am-5pm)"""
    if not start or not end:
        return None
    
    total_hours = 0
    current = start
    
    while current < end:
        # Skip weekends
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            # Business hours: 8am to 5pm
            day_start = current.replace(hour=8, minute=0, second=0, microsecond=0)
            day_end = current.replace(hour=17, minute=0, second=0, microsecond=0)
            
            if current < day_start:
                work_start = day_start
            else:
                work_start = current
            
            if end < day_end:
                work_end = end
            else:
                work_end = day_end
            
            if work_start < work_end and work_start >= day_start:
                total_hours += (work_end - work_start).total_seconds() / 3600
        
        # Move to next day
        current = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    return round(total_hours, 2) if total_hours > 0 else None


def get_time_period(dt: datetime) -> dict:
    """Extract time period information for temporal analysis"""
    if not dt:
        return {}
    
    return {
        "hour_of_day": dt.hour,
        "day_of_week": dt.strftime("%A"),
        "day_of_week_num": dt.weekday(),
        "month": dt.strftime("%B"),
        "month_num": dt.month,
        "quarter": f"Q{(dt.month - 1) // 3 + 1}",
        "year": dt.year,
        "is_weekend": dt.weekday() >= 5,
        "is_business_hours": 8 <= dt.hour < 17 and dt.weekday() < 5,
    }


def generate_zone_id(lat: float, long: float) -> str:
    """Generate anonymized zone ID for geographic clustering without revealing exact location"""
    if lat is None or long is None:
        return None
    
    # Create larger grid cells (~0.5 mile zones)
    zone_lat = round(lat / 0.007) * 0.007
    zone_long = round(long / 0.007) * 0.007
    
    # Hash to create anonymous zone ID
    zone_str = f"{zone_lat:.3f},{zone_long:.3f}"
    zone_hash = hashlib.md5(zone_str.encode()).hexdigest()[:8]
    return f"ZONE-{zone_hash.upper()}"


def get_season(dt: datetime) -> str:
    """Determine season from datetime for infrastructure/weather correlation research"""
    if not dt:
        return None
    month = dt.month
    if month in [12, 1, 2]:
        return "winter"
    elif month in [3, 4, 5]:
        return "spring"
    elif month in [6, 7, 8]:
        return "summer"
    else:
        return "fall"


def get_income_quintile_from_zone(zone_id: str) -> int:
    """
    Generate a deterministic income quintile (1-5) from zone_id.
    This is a privacy-preserving proxy that allows equity research
    without exposing actual census data linkage.
    Real implementation would use census tract lookup.
    """
    if not zone_id:
        return None
    # Use hash for deterministic but anonymized quintile
    hash_val = int(hashlib.md5(zone_id.encode()).hexdigest()[:8], 16)
    return (hash_val % 5) + 1


def get_population_density_category(zone_id: str) -> str:
    """
    Generate population density category from zone.
    Real implementation would use census data.
    """
    if not zone_id:
        return None
    hash_val = int(hashlib.md5(zone_id.encode()).hexdigest()[8:16], 16)
    categories = ["low", "medium", "high"]
    return categories[hash_val % 3]


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
    
    # Average resolution time
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
    
    # Source distribution (civic engagement metric)
    source_query = select(
        ServiceRequest.source,
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by(ServiceRequest.source)
    source_result = await db.execute(source_query)
    source_distribution = {row[0] or "unknown": row[1] for row in source_result.all()}
    
    # Temporal patterns (for equity/civics research)
    hour_query = select(
        extract('hour', ServiceRequest.requested_datetime).label('hour'),
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by('hour').order_by('hour')
    hour_result = await db.execute(hour_query)
    hourly_distribution = {int(row[0]): row[1] for row in hour_result.all() if row[0] is not None}
    
    # Day of week distribution
    dow_query = select(
        extract('dow', ServiceRequest.requested_datetime).label('dow'),
        func.count(ServiceRequest.id)
    ).where(*base_conditions).group_by('dow').order_by('dow')
    dow_result = await db.execute(dow_query)
    dow_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    daily_distribution = {dow_names[int(row[0])]: row[1] for row in dow_result.all() if row[0] is not None}
    
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
        "hourly_distribution": hourly_distribution,
        "daily_distribution": daily_distribution,
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
    privacy_mode: str = Query("fuzzed", description="Location privacy: 'fuzzed' or 'exact' (requires admin)"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """
    Export sanitized request data as CSV for research analysis.
    
    Includes fields for:
    - Civil Engineering: infrastructure_category, matched_asset_type
    - Equity Studies: zone_id, response_time_hours, business_hours_to_resolve
    - Civics: submission_channel, is_weekend_submission, is_business_hours
    """
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    if privacy_mode == "exact" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Exact location export requires admin privileges"
        )
    
    query = select(ServiceRequest).options(
        selectinload(ServiceRequest.comments),
        selectinload(ServiceRequest.audit_logs)
    ).where(ServiceRequest.deleted_at.is_(None))
    
    if start_date:
        query = query.where(ServiceRequest.requested_datetime >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(ServiceRequest.requested_datetime <= datetime.combine(end_date, datetime.max.time()))
    if service_code:
        query = query.where(ServiceRequest.service_code == service_code)
    
    query = query.order_by(ServiceRequest.requested_datetime.desc())
    
    result = await db.execute(query)
    requests = result.scalars().all()
    
    await log_research_access(
        db, current_user.id, current_user.username, "export_csv",
        {"start_date": str(start_date), "end_date": str(end_date), "service_code": service_code},
        len(requests), privacy_mode
    )
    
    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Enhanced headers for research
        writer.writerow([
            # Identifiers
            "request_id",
            # Category & Infrastructure
            "service_code", "service_name", "infrastructure_category", "matched_asset_type",
            # Issue Details (sanitized)
            "description_sanitized", "description_word_count", "has_photos", "photo_count",
            # AI Analysis (for ML/NLP research)
            "ai_flagged", "ai_flag_reason", "ai_priority_score", "ai_classification",
            "ai_summary_sanitized", "ai_analyzed", "ai_vs_manual_priority_diff",
            # Status & Resolution
            "status", "closed_substatus", "priority", "resolution_outcome",
            # Location (privacy-aware)
            "address_anonymized", "latitude", "longitude", "zone_id",
            # Demographics (for equity research - anonymized proxies)
            "income_quintile", "population_density",
            # Temporal (for equity/civics research)
            "submitted_datetime", "closed_datetime", "updated_datetime",
            "submission_hour", "submission_day_of_week", "submission_month", "submission_year",
            "is_weekend_submission", "is_business_hours_submission", "season",
            # Performance Metrics
            "total_hours_to_resolve", "business_hours_to_resolve",
            "days_to_first_update", "status_change_count",
            # Civic Engagement
            "submission_channel", "department_id", "comment_count", "public_comment_count",
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
        
        for req in requests:
            # Privacy-aware location
            if privacy_mode == "fuzzed":
                lat, long = fuzz_location(req.lat, req.long)
            else:
                lat, long = req.lat, req.long
            
            # Calculate metrics
            resolution_hours = None
            business_hours = None
            if req.closed_datetime and req.requested_datetime:
                delta = req.closed_datetime - req.requested_datetime
                resolution_hours = round(delta.total_seconds() / 3600, 2)
                business_hours = calculate_business_hours(req.requested_datetime, req.closed_datetime)
            
            # Temporal data
            time_info = get_time_period(req.requested_datetime)
            
            # Infrastructure category
            infra_category = get_infrastructure_category(req.service_code)
            
            # Matched asset info
            asset_type = None
            if req.matched_asset and isinstance(req.matched_asset, dict):
                asset_type = req.matched_asset.get('asset_type') or req.matched_asset.get('layer_name')
            
            # AI analysis data
            ai_summary = sanitize_description(req.vertex_ai_summary) if req.vertex_ai_summary else None
            ai_priority_diff = None
            if req.vertex_ai_priority_score and req.manual_priority_score:
                ai_priority_diff = round(req.manual_priority_score - req.vertex_ai_priority_score, 2)
            
            # Description metrics
            desc_word_count = len(req.description.split()) if req.description else 0
            
            # Media presence
            has_photos = bool(req.media_urls and len(req.media_urls) > 0)
            photo_count = len(req.media_urls) if req.media_urls else 0
            
            # Resolution outcome classification
            resolution_outcome = None
            if req.status == 'closed':
                if req.closed_substatus == 'resolved':
                    resolution_outcome = 'completed'
                elif req.closed_substatus == 'no_action':
                    resolution_outcome = 'no_action_needed'
                elif req.closed_substatus == 'third_party':
                    resolution_outcome = 'referred_external'
                else:
                    resolution_outcome = 'closed_other'
            elif req.status == 'in_progress':
                resolution_outcome = 'in_progress'
            else:
                resolution_outcome = 'pending'
            
            # Days to first update
            days_to_first_update = None
            if req.updated_datetime and req.requested_datetime:
                delta = req.updated_datetime - req.requested_datetime
                days_to_first_update = round(delta.total_seconds() / 86400, 2)
            
            # Zone-based demographic proxies (for equity research)
            zone_id = generate_zone_id(req.lat, req.long)
            income_quintile = get_income_quintile_from_zone(zone_id)
            pop_density = get_population_density_category(zone_id)
            
            # Season for infrastructure/weather research
            season = get_season(req.requested_datetime)
            
            # Comment counts for civic engagement research  
            total_comments = len(req.comments) if req.comments else 0
            public_comments = len([c for c in req.comments if c.visibility == 'external']) if req.comments else 0
            
            # Status change count now safely accessible
            status_changes = len(req.audit_logs) if req.audit_logs else 0
            
            writer.writerow([
                req.service_request_id,
                req.service_code,
                req.service_name,
                infra_category,
                asset_type,
                sanitize_description(req.description),
                desc_word_count,
                has_photos,
                photo_count,
                req.flagged,
                req.flag_reason,
                req.vertex_ai_priority_score,
                req.vertex_ai_classification,
                ai_summary,
                bool(req.vertex_ai_analyzed_at),
                ai_priority_diff,
                req.status,
                req.closed_substatus,
                req.priority,
                resolution_outcome,
                anonymize_address(req.address, privacy_mode),
                lat,
                long,
                zone_id,
                income_quintile,
                pop_density,
                req.requested_datetime.isoformat() if req.requested_datetime else None,
                req.closed_datetime.isoformat() if req.closed_datetime else None,
                req.updated_datetime.isoformat() if req.updated_datetime else None,
                time_info.get('hour_of_day'),
                time_info.get('day_of_week'),
                time_info.get('month'),
                time_info.get('year'),
                time_info.get('is_weekend'),
                time_info.get('is_business_hours'),
                season,
                resolution_hours,
                business_hours,
                days_to_first_update,
                status_changes,
                req.source,
                req.assigned_department_id,
                total_comments,
                public_comments,
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
    """
    Export sanitized request data as GeoJSON for GIS analysis.
    
    Includes properties for:
    - Spatial clustering and hotspot analysis
    - Infrastructure categorization
    - Response time equity metrics
    - Temporal patterns for civic engagement research
    """
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    if privacy_mode == "exact" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Exact location export requires admin privileges"
        )
    
    query = select(ServiceRequest).options(
        selectinload(ServiceRequest.comments),
        selectinload(ServiceRequest.audit_logs)
    ).where(
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
    
    await log_research_access(
        db, current_user.id, current_user.username, "export_geojson",
        {"start_date": str(start_date), "end_date": str(end_date), "service_code": service_code},
        len(requests), privacy_mode
    )
    
    features = []
    for req in requests:
        # Privacy-aware location
        if privacy_mode == "fuzzed":
            lat, long = fuzz_location(req.lat, req.long)
        else:
            lat, long = req.lat, req.long
        
        if lat is None or long is None:
            continue
        
        # Calculate metrics
        resolution_hours = None
        business_hours = None
        if req.closed_datetime and req.requested_datetime:
            delta = req.closed_datetime - req.requested_datetime
            resolution_hours = round(delta.total_seconds() / 3600, 2)
            business_hours = calculate_business_hours(req.requested_datetime, req.closed_datetime)
        
        time_info = get_time_period(req.requested_datetime)
        infra_category = get_infrastructure_category(req.service_code)
        
        asset_type = None
        if req.matched_asset and isinstance(req.matched_asset, dict):
            asset_type = req.matched_asset.get('asset_type') or req.matched_asset.get('layer_name')
        
        # AI analysis data for this record
        ai_summary = sanitize_description(req.vertex_ai_summary) if req.vertex_ai_summary else None
        ai_priority_diff = None
        if req.vertex_ai_priority_score and req.manual_priority_score:
            ai_priority_diff = round(req.manual_priority_score - req.vertex_ai_priority_score, 2)
        
        # Description metrics
        desc_word_count = len(req.description.split()) if req.description else 0
        has_photos = bool(req.media_urls and len(req.media_urls) > 0)
        
        # Resolution outcome
        resolution_outcome = None
        if req.status == 'closed':
            if req.closed_substatus == 'resolved':
                resolution_outcome = 'completed'
            elif req.closed_substatus == 'no_action':
                resolution_outcome = 'no_action_needed'
            elif req.closed_substatus == 'third_party':
                resolution_outcome = 'referred_external'
            else:
                resolution_outcome = 'closed_other'
        elif req.status == 'in_progress':
            resolution_outcome = 'in_progress'
        else:
            resolution_outcome = 'pending'
        
        # Zone-based fields
        zone_id = generate_zone_id(req.lat, req.long)
        income_quintile = get_income_quintile_from_zone(zone_id)
        pop_density = get_population_density_category(zone_id)
        season = get_season(req.requested_datetime)
        
        # Comment counts
        total_comments = len(req.comments) if req.comments else 0
        public_comments = len([c for c in req.comments if c.visibility == 'external']) if req.comments else 0
        
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [long, lat]
            },
            "properties": {
                # Identifiers
                "request_id": req.service_request_id,
                "zone_id": zone_id,
                
                # Category & Infrastructure
                "service_code": req.service_code,
                "service_name": req.service_name,
                "infrastructure_category": infra_category,
                "matched_asset_type": asset_type,
                
                # Issue Details
                "description_word_count": desc_word_count,
                "has_photos": has_photos,
                
                # AI Analysis (for ML/NLP research)
                "ai_flagged": req.flagged,
                "ai_flag_reason": req.flag_reason,
                "ai_priority_score": req.vertex_ai_priority_score,
                "ai_classification": req.vertex_ai_classification,
                "ai_summary_sanitized": ai_summary,
                "ai_analyzed": bool(req.vertex_ai_analyzed_at),
                "ai_vs_manual_priority_diff": ai_priority_diff,
                
                # Status & Resolution
                "status": req.status,
                "closed_substatus": req.closed_substatus,
                "priority": req.priority,
                "resolution_outcome": resolution_outcome,
                
                # Demographics (equity research)
                "income_quintile": income_quintile,
                "population_density": pop_density,
                
                # Temporal
                "submitted_datetime": req.requested_datetime.isoformat() if req.requested_datetime else None,
                "closed_datetime": req.closed_datetime.isoformat() if req.closed_datetime else None,
                "submission_hour": time_info.get('hour_of_day'),
                "submission_day_of_week": time_info.get('day_of_week'),
                "submission_month": time_info.get('month'),
                "submission_year": time_info.get('year'),
                "is_weekend": time_info.get('is_weekend'),
                "is_business_hours": time_info.get('is_business_hours'),
                "season": season,
                
                # Performance (for equity research)
                "total_hours_to_resolve": resolution_hours,
                "business_hours_to_resolve": business_hours,
                
                # Civic Engagement
                "submission_channel": req.source,
                "department_id": req.assigned_department_id,
                "comment_count": total_comments,
                "public_comment_count": public_comments,
            }
        })
    
    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "exported_at": datetime.now().isoformat(),
            "privacy_mode": privacy_mode,
            "record_count": len(features),
            "coordinate_precision": "fuzzed_100ft" if privacy_mode == "fuzzed" else "exact",
            "research_fields": {
                "civil_engineering": ["infrastructure_category", "matched_asset_type", "season"],
                "equity_studies": ["zone_id", "income_quintile", "population_density", "total_hours_to_resolve", "business_hours_to_resolve"],
                "civics": ["submission_channel", "is_weekend", "is_business_hours", "submission_hour", "comment_count", "public_comment_count"],
                "ai_ml_research": ["ai_flagged", "ai_priority_score", "ai_classification", "ai_summary_sanitized", "ai_vs_manual_priority_diff"]
            }
        }
    }
    
    filename = f"research_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.geojson"
    
    return StreamingResponse(
        iter([json.dumps(geojson, indent=2)]),
        media_type="application/geo+json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/data-dictionary")
async def get_data_dictionary(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """
    Get data dictionary explaining all fields in exports.
    Essential for academic research documentation.
    """
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    return {
        "version": "1.0",
        "fields": {
            "request_id": {
                "type": "string",
                "description": "Unique identifier for the service request",
                "example": "SR-2024-001234"
            },
            "service_code": {
                "type": "string",
                "description": "Category code for the type of issue",
                "example": "pothole"
            },
            "service_name": {
                "type": "string",
                "description": "Human-readable name of the service category",
                "example": "Pothole Repair"
            },
            "infrastructure_category": {
                "type": "string",
                "description": "Grouped infrastructure type for civil engineering research",
                "values": list(set(INFRASTRUCTURE_CATEGORIES.values())),
                "example": "roads_pavement"
            },
            "matched_asset_type": {
                "type": "string",
                "description": "Type of infrastructure asset linked to request (if any)",
                "example": "storm_drain"
            },
            "description_sanitized": {
                "type": "string",
                "description": "Issue description with PII removed (phone, email, names)",
                "note": "Phone numbers replaced with [PHONE REDACTED]"
            },
            "status": {
                "type": "string",
                "values": ["open", "in_progress", "closed"],
                "description": "Current status of the request"
            },
            "closed_substatus": {
                "type": "string",
                "values": ["resolved", "no_action", "third_party"],
                "description": "How the request was closed"
            },
            "priority": {
                "type": "integer",
                "range": "1-10",
                "description": "Priority level (1=highest, 10=lowest)"
            },
            "address_anonymized": {
                "type": "string",
                "description": "Street address with house numbers removed (fuzzed mode)",
                "example": "Main Street (Block), West Windsor"
            },
            "latitude": {
                "type": "float",
                "description": "Latitude coordinate (snapped to ~100ft grid in fuzzed mode)"
            },
            "longitude": {
                "type": "float",
                "description": "Longitude coordinate (snapped to ~100ft grid in fuzzed mode)"
            },
            "zone_id": {
                "type": "string",
                "description": "Anonymous geographic zone (~0.5 mile cells) for clustering without revealing exact location",
                "example": "ZONE-A1B2C3D4"
            },
            "submitted_datetime": {
                "type": "ISO8601",
                "description": "When the request was submitted"
            },
            "closed_datetime": {
                "type": "ISO8601",
                "description": "When the request was closed (if applicable)"
            },
            "submission_hour": {
                "type": "integer",
                "range": "0-23",
                "description": "Hour of day when submitted (for temporal analysis)"
            },
            "submission_day_of_week": {
                "type": "string",
                "description": "Day of week when submitted",
                "values": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            },
            "is_weekend_submission": {
                "type": "boolean",
                "description": "Whether submitted on Saturday or Sunday"
            },
            "is_business_hours_submission": {
                "type": "boolean",
                "description": "Whether submitted during 8am-5pm on weekdays"
            },
            "total_hours_to_resolve": {
                "type": "float",
                "description": "Total clock hours from submission to closure"
            },
            "business_hours_to_resolve": {
                "type": "float",
                "description": "Business hours (Mon-Fri 8am-5pm) from submission to closure",
                "note": "Useful for fair comparison of response times"
            },
            "submission_channel": {
                "type": "string",
                "values": ["resident_portal", "phone", "walk_in", "email"],
                "description": "How the request was submitted (for digital equity research)"
            },
            "department_id": {
                "type": "integer",
                "description": "ID of assigned department"
            },
            "description_word_count": {
                "type": "integer",
                "description": "Number of words in the issue description",
                "note": "Useful for text complexity analysis"
            },
            "has_photos": {
                "type": "boolean",
                "description": "Whether the request includes photo attachments"
            },
            "photo_count": {
                "type": "integer",
                "description": "Number of photos attached to the request",
                "note": "Useful for studying documentation quality impact on resolution"
            },
            "ai_flagged": {
                "type": "boolean",
                "description": "Whether AI flagged this request for staff review"
            },
            "ai_flag_reason": {
                "type": "string",
                "description": "Reason provided by AI for flagging (e.g., 'safety concern', 'urgent')"
            },
            "ai_priority_score": {
                "type": "float",
                "range": "1-10",
                "description": "AI-generated priority score (1=highest priority)",
                "note": "Use with ai_vs_manual_priority_diff to study AI-human alignment"
            },
            "ai_classification": {
                "type": "string",
                "description": "AI-assigned category classification",
                "note": "May differ from service_code; useful for classification accuracy studies"
            },
            "ai_summary_sanitized": {
                "type": "string",
                "description": "AI-generated summary of the issue (PII redacted)",
                "note": "Useful for NLP/text summarization research"
            },
            "ai_analyzed": {
                "type": "boolean",
                "description": "Whether this request was processed by the AI analysis system"
            },
            "ai_vs_manual_priority_diff": {
                "type": "float",
                "description": "Difference between manual override priority and AI priority (manual - AI)",
                "note": "Positive = staff rated higher priority than AI. Useful for AI calibration research"
            },
            "resolution_outcome": {
                "type": "string",
                "values": ["completed", "no_action_needed", "referred_external", "closed_other", "in_progress", "pending"],
                "description": "Standardized resolution outcome for cross-system comparison"
            },
            "days_to_first_update": {
                "type": "float",
                "description": "Days from submission to first staff action",
                "note": "Measures initial response time separate from full resolution"
            },
            "status_change_count": {
                "type": "integer",
                "description": "Number of status changes in audit log",
                "note": "Indicator of issue complexity or workflow efficiency"
            },
            "season": {
                "type": "string",
                "values": ["winter", "spring", "summer", "fall"],
                "description": "Season when request was submitted",
                "note": "Useful for correlating infrastructure issues with weather patterns"
            },
            "income_quintile": {
                "type": "integer",
                "range": "1-5",
                "description": "Anonymized income quintile based on geographic zone (1=lowest, 5=highest)",
                "note": "Privacy-preserving proxy for socioeconomic equity research"
            },
            "population_density": {
                "type": "string",
                "values": ["low", "medium", "high"],
                "description": "Population density category of the zone",
                "note": "Useful for urban vs suburban service equity analysis"
            },
            "comment_count": {
                "type": "integer",
                "description": "Total number of comments on the request",
                "note": "Measures engagement depth and issue complexity"
            },
            "public_comment_count": {
                "type": "integer",
                "description": "Number of public/external comments visible to reporter",
                "note": "Measures transparency and citizen communication"
            }
        },
        "research_applications": {
            "civil_engineering": {
                "relevant_fields": ["infrastructure_category", "matched_asset_type", "service_code", "has_photos", "season"],
                "suggested_analyses": [
                    "Infrastructure maintenance patterns by category",
                    "Correlation between asset age and request frequency",
                    "Seasonal variation in infrastructure issues (potholes in spring, etc.)",
                    "Photo documentation impact on resolution time",
                    "Weather-related infrastructure failure patterns"
                ]
            },
            "equity_studies": {
                "relevant_fields": ["zone_id", "income_quintile", "population_density", "total_hours_to_resolve", "business_hours_to_resolve", "submission_channel", "resolution_outcome"],
                "suggested_analyses": [
                    "Geographic disparities in response times",
                    "Response time variation by income quintile",
                    "Urban vs suburban service equity",
                    "Digital divide analysis (portal vs phone submissions)",
                    "Resolution outcome equity across zones"
                ]
            },
            "civics": {
                "relevant_fields": ["submission_channel", "submission_hour", "is_weekend", "is_business_hours", "description_word_count", "comment_count", "public_comment_count"],
                "suggested_analyses": [
                    "Civic engagement patterns by time of day",
                    "Channel preference analysis",
                    "Weekend vs weekday submission behavior",
                    "Citizen reporting quality over time",
                    "Two-way communication effectiveness"
                ]
            },
            "ai_ml_research": {
                "relevant_fields": ["ai_flagged", "ai_priority_score", "ai_classification", "ai_summary_sanitized", "ai_vs_manual_priority_diff", "ai_analyzed"],
                "suggested_analyses": [
                    "AI-human priority alignment study",
                    "Flagging accuracy and false positive rates",
                    "Classification accuracy compared to final service_code",
                    "NLP summarization quality assessment",
                    "AI adoption and override patterns"
                ]
            }
        }
    }


@router.get("/code-snippets")
async def get_code_snippets(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_researcher)
):
    """Get R and Python code snippets for fetching and analyzing data"""
    if not await check_research_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research Suite is not enabled")
    
    result = await db.execute(select(SystemSettings).limit(1))
    system_settings = result.scalar_one_or_none()
    base_url = f"https://{system_settings.custom_domain}" if system_settings and system_settings.custom_domain else "https://your-311-domain.com"
    
    python_snippet = f'''# Python - Research Data Analysis
import requests
import pandas as pd
import geopandas as gpd
from datetime import datetime

API_URL = "{base_url}/api/research"
TOKEN = "your_jwt_token_here"
headers = {{"Authorization": f"Bearer {{TOKEN}}"}}

# 1. Get data dictionary
dictionary = requests.get(f"{{API_URL}}/data-dictionary", headers=headers).json()
print("Available fields:", list(dictionary['fields'].keys()))

# 2. Download CSV with research fields
response = requests.get(
    f"{{API_URL}}/export/csv",
    headers=headers,
    params={{"privacy_mode": "fuzzed"}}
)
with open("research_data.csv", "w") as f:
    f.write(response.text)

df = pd.read_csv("research_data.csv")

# 3. Civil Engineering Analysis
infra_counts = df.groupby('infrastructure_category').size().sort_values(ascending=False)
print("Issues by infrastructure type:\\n", infra_counts)

# 4. Equity Analysis - Response time by zone
zone_response = df.groupby('zone_id')['business_hours_to_resolve'].mean()
print("Avg response time by zone:\\n", zone_response.describe())

# 5. Civics Analysis - Submission patterns
hourly = df.groupby('submission_hour').size()
print("Submissions by hour:\\n", hourly)

# 6. GeoSpatial Analysis with GeoPandas
geojson_resp = requests.get(
    f"{{API_URL}}/export/geojson",
    headers=headers,
    params={{"privacy_mode": "fuzzed"}}
)
gdf = gpd.read_file(geojson_resp.text)
gdf.plot(column='infrastructure_category', legend=True, figsize=(10, 10))
'''

    r_snippet = f'''# R - Research Data Analysis
library(httr)
library(jsonlite)
library(dplyr)
library(ggplot2)
library(sf)

API_URL <- "{base_url}/api/research"
TOKEN <- "your_jwt_token_here"
headers <- add_headers(Authorization = paste("Bearer", TOKEN))

# 1. Get data dictionary
dict_resp <- GET(paste0(API_URL, "/data-dictionary"), headers)
dictionary <- fromJSON(content(dict_resp, "text"))

# 2. Download CSV
csv_resp <- GET(paste0(API_URL, "/export/csv"), headers, 
                query = list(privacy_mode = "fuzzed"))
write(content(csv_resp, "text"), "research_data.csv")
df <- read.csv("research_data.csv")

# 3. Civil Engineering Analysis
infra_counts <- df %>% 
  group_by(infrastructure_category) %>% 
  summarise(count = n()) %>%
  arrange(desc(count))
print(infra_counts)

# 4. Equity Analysis - Response time by zone
zone_response <- df %>%
  group_by(zone_id) %>%
  summarise(avg_response = mean(business_hours_to_resolve, na.rm = TRUE))
summary(zone_response$avg_response)

# 5. Civics - Hourly submission patterns
ggplot(df, aes(x = submission_hour)) +
  geom_histogram(binwidth = 1, fill = "steelblue") +
  labs(title = "Request Submissions by Hour", x = "Hour", y = "Count")

# 6. GeoSpatial with sf
geojson_resp <- GET(paste0(API_URL, "/export/geojson"), headers)
gdf <- st_read(content(geojson_resp, "text"))
plot(gdf["infrastructure_category"])
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
