from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
import subprocess
import os
import uuid
import logging
import aiofiles

logger = logging.getLogger(__name__)

from app.db.session import get_db
from app.models import SystemSettings, SystemSecret, ServiceRequest, User
from app.schemas import (
    SystemSettingsBase, SystemSettingsResponse,
    SecretCreate, SecretUpdate, SecretResponse,
    StatisticsResponse, ServiceRequestResponse
)
from app.core.auth import get_current_admin, get_current_staff

router = APIRouter()


# ============ Settings ============

@router.get("/settings", response_model=SystemSettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get system settings (public - for branding)"""
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        # Create default settings if none exist
        settings = SystemSettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.post("/settings", response_model=SystemSettingsResponse)
async def update_settings(
    settings_data: SystemSettingsBase,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Update system settings (admin only)"""
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        settings = SystemSettings()
        db.add(settings)
    
    for field, value in settings_data.model_dump().items():
        setattr(settings, field, value)
    
    await db.commit()
    await db.refresh(settings)
    return settings


# ============ Secrets ============

@router.get("/secrets", response_model=List[SecretResponse])
async def list_secrets(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """List all secrets (admin only). Non-sensitive config values are returned."""
    # These keys can have their values exposed (they're config choices, not secrets)
    SAFE_TO_RETURN = {'SMS_PROVIDER', 'EMAIL_ENABLED', 'SMTP_USE_TLS', 'SMTP_PORT'}
    
    result = await db.execute(select(SystemSecret))
    secrets = result.scalars().all()
    
    response = []
    for secret in secrets:
        data = SecretResponse.model_validate(secret)
        # Only include key_value for non-sensitive config options
        if secret.key_name in SAFE_TO_RETURN and secret.is_configured:
            data.key_value = secret.key_value
        response.append(data)
    
    return response


@router.post("/secrets", response_model=SecretResponse)
async def create_or_update_secret(
    secret_data: SecretCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Create or update a secret (admin only)"""
    result = await db.execute(
        select(SystemSecret).where(SystemSecret.key_name == secret_data.key_name)
    )
    secret = result.scalar_one_or_none()
    
    if secret:
        secret.key_value = secret_data.key_value
        secret.is_configured = bool(secret_data.key_value)
    else:
        secret = SystemSecret(
            key_name=secret_data.key_name,
            key_value=secret_data.key_value,
            description=secret_data.description,
            is_configured=bool(secret_data.key_value)
        )
        db.add(secret)
    
    await db.commit()
    await db.refresh(secret)
    return secret


@router.post("/secrets/sync")
async def sync_secrets(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Add any missing secrets from the default list (admin only)"""
    from app.db.init_db import DEFAULT_SECRETS
    
    added = []
    for secret_data in DEFAULT_SECRETS:
        result = await db.execute(
            select(SystemSecret).where(SystemSecret.key_name == secret_data["key_name"])
        )
        existing = result.scalar_one_or_none()
        
        if not existing:
            secret = SystemSecret(
                key_name=secret_data["key_name"],
                description=secret_data.get("description", ""),
                is_configured=False
            )
            db.add(secret)
            added.append(secret_data["key_name"])
    
    await db.commit()
    return {"status": "success", "added_secrets": added, "count": len(added)}


# ============ Statistics ============

@router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_staff)
):
    """Get system statistics (staff only)"""
    # Total counts by status
    total = await db.execute(select(func.count(ServiceRequest.id)))
    total_count = total.scalar() or 0
    
    open_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.status == "open")
    )
    open_count = open_result.scalar() or 0
    
    in_progress_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.status == "in_progress")
    )
    in_progress_count = in_progress_result.scalar() or 0
    
    closed_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.status == "closed")
    )
    closed_count = closed_result.scalar() or 0
    
    # Requests by category
    category_result = await db.execute(
        select(ServiceRequest.service_name, func.count(ServiceRequest.id))
        .group_by(ServiceRequest.service_name)
    )
    requests_by_category = {row[0]: row[1] for row in category_result.all()}
    
    # Recent requests
    recent_result = await db.execute(
        select(ServiceRequest)
        .order_by(ServiceRequest.requested_datetime.desc())
        .limit(10)
    )
    recent_requests = recent_result.scalars().all()
    
    return StatisticsResponse(
        total_requests=total_count,
        open_requests=open_count,
        in_progress_requests=in_progress_count,
        closed_requests=closed_count,
        requests_by_category=requests_by_category,
        requests_by_status={
            "open": open_count,
            "in_progress": in_progress_count,
            "closed": closed_count
        },
        recent_requests=recent_requests
    )


# ============ Advanced Statistics (PostGIS-powered) ============

from sqlalchemy import text, extract, case
from sqlalchemy.sql.expression import literal_column
from datetime import timedelta
import json
from app.schemas import (
    AdvancedStatisticsResponse, HotspotData, TrendData, DepartmentMetrics,
    PredictiveInsights, CostEstimate, RepeatLocation
)
from app.models import Department

# Redis client import (reuse from open311)
try:
    from app.api.open311 import redis_client
except ImportError:
    redis_client = None

STATS_CACHE_TTL = 300  # 5 minutes


@router.get("/advanced-statistics", response_model=AdvancedStatisticsResponse)
async def get_advanced_statistics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_staff)
):
    """Get advanced PostGIS-powered statistics (staff only, cached for 5 minutes)"""
    
    # Check cache first
    cache_key = "advanced_statistics"
    try:
        if redis_client:
            cached = await redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                data["cached_at"] = data.get("cached_at")
                return AdvancedStatisticsResponse(**data)
    except Exception:
        pass  # Redis unavailable

    from datetime import datetime
    now = datetime.utcnow()
    
    # ========== Basic Counts ==========
    base_query = select(ServiceRequest).where(ServiceRequest.deleted_at.is_(None))
    
    total_result = await db.execute(select(func.count(ServiceRequest.id)).where(ServiceRequest.deleted_at.is_(None)))
    total_count = total_result.scalar() or 0
    
    open_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.deleted_at.is_(None), ServiceRequest.status == "open")
    )
    open_count = open_result.scalar() or 0
    
    in_progress_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.deleted_at.is_(None), ServiceRequest.status == "in_progress")
    )
    in_progress_count = in_progress_result.scalar() or 0
    
    closed_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.deleted_at.is_(None), ServiceRequest.status == "closed")
    )
    closed_count = closed_result.scalar() or 0
    
    # ========== Temporal Analytics ==========
    
    # Requests by hour of day
    hour_query = select(
        extract('hour', ServiceRequest.requested_datetime).label('hour'),
        func.count(ServiceRequest.id)
    ).where(ServiceRequest.deleted_at.is_(None)).group_by('hour')
    hour_result = await db.execute(hour_query)
    requests_by_hour = {int(row[0]): row[1] for row in hour_result.all() if row[0] is not None}
    # Fill missing hours with 0
    for h in range(24):
        if h not in requests_by_hour:
            requests_by_hour[h] = 0
    
    # Requests by day of week
    dow_query = select(
        extract('dow', ServiceRequest.requested_datetime).label('dow'),
        func.count(ServiceRequest.id)
    ).where(ServiceRequest.deleted_at.is_(None)).group_by('dow')
    dow_result = await db.execute(dow_query)
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    requests_by_day_of_week = {}
    for row in dow_result.all():
        if row[0] is not None:
            requests_by_day_of_week[day_names[int(row[0])]] = row[1]
    for day in day_names:
        if day not in requests_by_day_of_week:
            requests_by_day_of_week[day] = 0
    
    # Requests by month (last 12 months)
    month_query = select(
        func.to_char(ServiceRequest.requested_datetime, 'YYYY-MM').label('month'),
        func.count(ServiceRequest.id)
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.requested_datetime >= now - timedelta(days=365)
    ).group_by('month').order_by('month')
    month_result = await db.execute(month_query)
    requests_by_month = {row[0]: row[1] for row in month_result.all() if row[0]}
    
    # Average resolution hours by category
    resolution_query = select(
        ServiceRequest.service_name,
        func.avg(
            extract('epoch', ServiceRequest.closed_datetime - ServiceRequest.requested_datetime) / 3600
        ).label('avg_hours')
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status == "closed",
        ServiceRequest.closed_datetime.isnot(None)
    ).group_by(ServiceRequest.service_name)
    resolution_result = await db.execute(resolution_query)
    avg_resolution_hours_by_category = {
        row[0]: round(float(row[1]), 2) if row[1] else 0 
        for row in resolution_result.all() if row[0]
    }
    
    # ========== Geospatial Analytics (PostGIS) ==========
    
    # Hotspot detection using PostGIS ST_ClusterDBSCAN
    # Cluster points within 500m with minimum 2 points per cluster
    hotspots = []
    try:
        # Get clusters with addresses, categories, and unique reporter count
        hotspot_query = text("""
            WITH clustered AS (
                SELECT 
                    id, lat, long, address, service_name, email,
                    ST_ClusterDBSCAN(location, eps := 0.005, minpoints := 2) OVER () as cluster_id
                FROM service_requests
                WHERE deleted_at IS NULL 
                AND location IS NOT NULL
            ),
            cluster_stats AS (
                SELECT 
                    cluster_id,
                    AVG(lat) as center_lat,
                    AVG(long) as center_lng,
                    COUNT(*) as point_count,
                    COUNT(DISTINCT email) as unique_reporters,
                    (ARRAY_AGG(address ORDER BY id DESC))[1] as sample_address,
                    (ARRAY_AGG(DISTINCT service_name))[1:3] as top_categories
                FROM clustered
                WHERE cluster_id IS NOT NULL
                GROUP BY cluster_id
            )
            SELECT center_lat, center_lng, point_count, cluster_id, sample_address, top_categories, unique_reporters
            FROM cluster_stats
            ORDER BY point_count DESC
            LIMIT 10
        """)
        hotspot_result = await db.execute(hotspot_query)
        for row in hotspot_result.mappings().all():
            hotspots.append(HotspotData(
                lat=float(row['center_lat']),
                lng=float(row['center_lng']),
                count=int(row['point_count']),
                cluster_id=int(row['cluster_id']),
                sample_address=row.get('sample_address'),
                top_categories=row.get('top_categories') or [],
                unique_reporters=int(row['unique_reporters']) if row.get('unique_reporters') else None
            ))
    except Exception as e:
        logger.warning(f"Hotspot query failed (PostGIS may not be enabled): {e}")
    
    # Geographic center
    center_query = select(
        func.avg(ServiceRequest.lat),
        func.avg(ServiceRequest.long)
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.lat.isnot(None),
        ServiceRequest.long.isnot(None)
    )
    center_result = await db.execute(center_query)
    center_row = center_result.one_or_none()
    geographic_center = None
    if center_row and center_row[0] and center_row[1]:
        geographic_center = {"lat": float(center_row[0]), "lng": float(center_row[1])}
    
    # Geospatial metrics in imperial units (miles)
    # 1 meter = 0.000621371 miles, 1 sq meter = 0.0000003861 sq miles
    geographic_spread_miles = None
    total_coverage_sq_miles = None
    avg_distance_from_center_miles = None
    furthest_request_miles = None
    
    try:
        geo_metrics_query = text("""
            WITH centroid AS (
                SELECT ST_Centroid(ST_Collect(location))::geography as center
                FROM service_requests 
                WHERE deleted_at IS NULL AND location IS NOT NULL
            ),
            distances AS (
                SELECT 
                    ST_Distance(location::geography, (SELECT center FROM centroid)) as dist_meters
                FROM service_requests
                WHERE deleted_at IS NULL AND location IS NOT NULL
            )
            SELECT 
                STDDEV(dist_meters) * 0.000621371 as spread_miles,
                AVG(dist_meters) * 0.000621371 as avg_distance_miles,
                MAX(dist_meters) * 0.000621371 as max_distance_miles,
                (SELECT ST_Area(ST_ConvexHull(ST_Collect(location))::geography) * 0.0000003861 
                 FROM service_requests WHERE deleted_at IS NULL AND location IS NOT NULL) as coverage_sq_miles
            FROM distances
        """)
        geo_result = await db.execute(geo_metrics_query)
        geo_row = geo_result.mappings().one_or_none()
        if geo_row:
            geographic_spread_miles = round(float(geo_row['spread_miles']), 2) if geo_row['spread_miles'] else None
            avg_distance_from_center_miles = round(float(geo_row['avg_distance_miles']), 2) if geo_row['avg_distance_miles'] else None
            furthest_request_miles = round(float(geo_row['max_distance_miles']), 2) if geo_row['max_distance_miles'] else None
            total_coverage_sq_miles = round(float(geo_row['coverage_sq_miles']), 2) if geo_row['coverage_sq_miles'] else None
    except Exception as e:
        logger.warning(f"Geographic metrics query failed: {e}")
    
    # ========== Department Analytics ==========
    
    dept_result = await db.execute(select(Department))
    departments = dept_result.scalars().all()
    
    department_metrics = []
    for dept in departments:
        dept_total = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.deleted_at.is_(None),
                ServiceRequest.assigned_department_id == dept.id
            )
        )
        dept_total_count = dept_total.scalar() or 0
        
        dept_open = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.deleted_at.is_(None),
                ServiceRequest.assigned_department_id == dept.id,
                ServiceRequest.status == "open"
            )
        )
        dept_open_count = dept_open.scalar() or 0
        
        dept_closed = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.deleted_at.is_(None),
                ServiceRequest.assigned_department_id == dept.id,
                ServiceRequest.status == "closed"
            )
        )
        dept_closed_count = dept_closed.scalar() or 0
        
        # Average resolution time for department
        dept_resolution = await db.execute(
            select(func.avg(
                extract('epoch', ServiceRequest.closed_datetime - ServiceRequest.requested_datetime) / 3600
            )).where(
                ServiceRequest.deleted_at.is_(None),
                ServiceRequest.assigned_department_id == dept.id,
                ServiceRequest.status == "closed",
                ServiceRequest.closed_datetime.isnot(None)
            )
        )
        dept_avg_hours = dept_resolution.scalar()
        
        department_metrics.append(DepartmentMetrics(
            name=dept.name,
            total_requests=dept_total_count,
            open_requests=dept_open_count,
            avg_resolution_hours=round(float(dept_avg_hours), 2) if dept_avg_hours else None,
            resolution_rate=round(dept_closed_count / dept_total_count * 100, 1) if dept_total_count > 0 else 0
        ))
    
    # Top staff by resolutions
    staff_query = select(
        ServiceRequest.assigned_to,
        func.count(ServiceRequest.id)
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status == "closed",
        ServiceRequest.assigned_to.isnot(None),
        ServiceRequest.assigned_to != ""
    ).group_by(ServiceRequest.assigned_to).order_by(func.count(ServiceRequest.id).desc()).limit(10)
    staff_result = await db.execute(staff_query)
    top_staff_by_resolutions = {row[0]: row[1] for row in staff_result.all() if row[0]}
    
    # ========== Performance Metrics ==========
    
    # Average resolution time overall
    overall_resolution = await db.execute(
        select(func.avg(
            extract('epoch', ServiceRequest.closed_datetime - ServiceRequest.requested_datetime) / 3600
        )).where(
            ServiceRequest.deleted_at.is_(None),
            ServiceRequest.status == "closed",
            ServiceRequest.closed_datetime.isnot(None)
        )
    )
    avg_resolution_hours = overall_resolution.scalar()
    if avg_resolution_hours:
        avg_resolution_hours = round(float(avg_resolution_hours), 2)
    
    # Backlog by age
    backlog_by_age = {"<1 day": 0, "1-3 days": 0, "3-7 days": 0, "1-2 weeks": 0, ">2 weeks": 0}
    open_requests_query = select(ServiceRequest.requested_datetime).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status.in_(["open", "in_progress"])
    )
    open_requests_result = await db.execute(open_requests_query)
    for row in open_requests_result.all():
        if row[0]:
            age = now - row[0].replace(tzinfo=None)
            if age < timedelta(days=1):
                backlog_by_age["<1 day"] += 1
            elif age < timedelta(days=3):
                backlog_by_age["1-3 days"] += 1
            elif age < timedelta(days=7):
                backlog_by_age["3-7 days"] += 1
            elif age < timedelta(days=14):
                backlog_by_age["1-2 weeks"] += 1
            else:
                backlog_by_age[">2 weeks"] += 1
    
    # Resolution rate (fixed: proper completion rate)
    # This is the percentage of all requests that have been successfully closed
    resolution_rate = round(closed_count / total_count * 100, 1) if total_count > 0 else 0
    
    # Category distribution
    category_query = select(
        ServiceRequest.service_name,
        func.count(ServiceRequest.id)
    ).where(ServiceRequest.deleted_at.is_(None)).group_by(ServiceRequest.service_name)
    category_result = await db.execute(category_query)
    requests_by_category = {row[0]: row[1] for row in category_result.all() if row[0]}
    
    # Flagged count
    flagged_result = await db.execute(
        select(func.count(ServiceRequest.id)).where(
            ServiceRequest.deleted_at.is_(None),
            ServiceRequest.flagged == True
        )
    )
    flagged_count = flagged_result.scalar() or 0
    
    # ========== Infrastructure Metrics ==========
    
    # Backlog by priority (current open + in_progress)
    priority_query = select(
        ServiceRequest.priority,
        func.count(ServiceRequest.id)
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status.in_(["open", "in_progress"])
    ).group_by(ServiceRequest.priority)
    priority_result = await db.execute(priority_query)
    backlog_by_priority = {int(row[0]): row[1] for row in priority_result.all() if row[0]}
    # Ensure all priorities 1-10 are represented
    for p in range(1, 11):
        if p not in backlog_by_priority:
            backlog_by_priority[p] = 0
    
    # Current workload by staff (active assignments)
    workload_query = select(
        ServiceRequest.assigned_to,
        func.count(ServiceRequest.id)
    ).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status.in_(["open", "in_progress"]),
        ServiceRequest.assigned_to.isnot(None),
        ServiceRequest.assigned_to != ""
    ).group_by(ServiceRequest.assigned_to)
    workload_result = await db.execute(workload_query)
    workload_by_staff = {row[0]: row[1] for row in workload_result.all() if row[0]}
    
    # SLA tracking (open requests only, by age)
    open_by_age_sla = {"<1 day": 0, "1-3 days": 0, "3-7 days": 0, "1-2 weeks": 0, ">2 weeks": 0}
    open_only_query = select(ServiceRequest.requested_datetime).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status == "open"  # Only "open" status, not in_progress
    )
    open_only_result = await db.execute(open_only_query)
    for row in open_only_result.all():
        if row[0]:
            age = now - row[0].replace(tzinfo=None)
            if age < timedelta(days=1):
                open_by_age_sla["<1 day"] += 1
            elif age < timedelta(days=3):
                open_by_age_sla["1-3 days"] += 1
            elif age < timedelta(days=7):
                open_by_age_sla["3-7 days"] += 1
            elif age < timedelta(days=14):
                open_by_age_sla["1-2 weeks"] += 1
            else:
                open_by_age_sla[">2 weeks"] += 1
    
    # ========== Predictive & Government Analytics ==========
    
    # Labor cost rates (hourly, in dollars)
    LABOR_RATES = {
        "Pothole": 50, "Street Repair": 75, "Snow Removal": 50,
        "Sewer": 85, "Water": 85, "Traffic Signal": 65,
        "Drainage": 70, "Road Maintenance": 65
    }
    DEFAULT_LABOR_RATE = 55
    
    # Cost estimates by category
    cost_estimates = []
    for category, total_cat_count in requests_by_category.items():
        # Get avg resolution hours for this category
        avg_hours = avg_resolution_hours_by_category.get(category, 2.5)
        labor_rate = LABOR_RATES.get(category, DEFAULT_LABOR_RATE)
        estimated_cost = avg_hours * labor_rate
        
        # Count open tickets in this category
        open_cat_query = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.deleted_at.is_(None),
                ServiceRequest.service_name == category,
                ServiceRequest.status.in_(["open", "in_progress"])
            )
        )
        open_in_category = open_cat_query.scalar() or 0
        
        cost_estimates.append(CostEstimate(
            category=category,
            avg_hours=round(avg_hours, 2),
            estimated_cost=round(estimated_cost, 2),
            open_tickets=open_in_category,
            total_estimated_cost=round(open_in_category * estimated_cost, 2)
        ))
    
    # Sort by total cost descending
    cost_estimates.sort(key=lambda x: x.total_estimated_cost, reverse=True)
    
    # Repeat locations (infrastructure maintenance indicators)
    repeat_locations = []
    try:
        repeat_query = text("""
            SELECT address, lat, long, COUNT(*) as request_count
            FROM service_requests
            WHERE deleted_at IS NULL 
            AND address IS NOT NULL
            AND lat IS NOT NULL
            AND long IS NOT NULL
            GROUP BY address, lat, long
            HAVING COUNT(*) >= 3
            ORDER BY COUNT(*) DESC
            LIMIT 10
        """)
        repeat_result = await db.execute(repeat_query)
        for row in repeat_result.mappings().all():
            if row['address'] and row['lat'] and row['long']:
                repeat_locations.append(RepeatLocation(
                    address=str(row['address']),
                    lat=float(row['lat']),
                    lng=float(row['long']),
                    request_count=int(row['request_count'])
                ))
    except Exception as e:
        logger.warning(f"Repeat locations query failed: {e}")
    
    # Aging high-priority count (P1-P3 open > 7 days)
    aging_hp_query = select(func.count(ServiceRequest.id)).where(
        ServiceRequest.deleted_at.is_(None),
        ServiceRequest.status == "open",
        ServiceRequest.priority.in_([1, 2, 3]),
        ServiceRequest.requested_datetime < now - timedelta(days=7)
    )
    aging_hp_result = await db.execute(aging_hp_query)
    aging_high_priority_count = aging_hp_result.scalar() or 0
    
    # ========== Trends ==========
    
    # Weekly trend (last 8 weeks)
    weekly_trend = []
    for i in range(7, -1, -1):
        week_start = now - timedelta(weeks=i+1)
        week_end = now - timedelta(weeks=i)
        week_label = f"W{8-i}"
        
        week_stats = {"period": week_label, "open": 0, "in_progress": 0, "closed": 0, "total": 0}
        for status in ["open", "in_progress", "closed"]:
            count_result = await db.execute(
                select(func.count(ServiceRequest.id)).where(
                    ServiceRequest.deleted_at.is_(None),
                    ServiceRequest.status == status,
                    ServiceRequest.requested_datetime >= week_start,
                    ServiceRequest.requested_datetime < week_end
                )
            )
            week_stats[status] = count_result.scalar() or 0
        week_stats["total"] = week_stats["open"] + week_stats["in_progress"] + week_stats["closed"]
        weekly_trend.append(TrendData(**week_stats))
    
    # Monthly trend (last 6 months)
    monthly_trend = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(day=1)
        if i > 0:
            month_end = (now.replace(day=1) - timedelta(days=30*(i-1))).replace(day=1)
        else:
            month_end = now
        month_label = month_start.strftime("%b")
        
        month_stats = {"period": month_label, "open": 0, "in_progress": 0, "closed": 0, "total": 0}
        for status in ["open", "in_progress", "closed"]:
            count_result = await db.execute(
                select(func.count(ServiceRequest.id)).where(
                    ServiceRequest.deleted_at.is_(None),
                    ServiceRequest.status == status,
                    ServiceRequest.requested_datetime >= month_start,
                    ServiceRequest.requested_datetime < month_end
                )
            )
            month_stats[status] = count_result.scalar() or 0
        month_stats["total"] = month_stats["open"] + month_stats["in_progress"] + month_stats["closed"]
        monthly_trend.append(TrendData(**month_stats))
    
    # Predictive insights
    # Volume forecast (simple moving average of last 4 weeks)
    if len(weekly_trend) >= 4:
        recent_volumes = [w.total for w in weekly_trend[-4:]]
        volume_forecast_next_week = int(sum(recent_volumes) / len(recent_volumes))
    else:
        volume_forecast_next_week = 0
    
    # Trend direction (compare last 2 weeks vs previous 2 weeks)
    if len(weekly_trend) >= 4:
        recent_avg = sum(w.total for w in weekly_trend[-2:]) / 2
        previous_avg = sum(w.total for w in weekly_trend[-4:-2]) / 2
        if recent_avg > previous_avg * 1.1:
            trend_direction = "increasing"
        elif recent_avg < previous_avg * 0.9:
            trend_direction = "decreasing"
        else:
            trend_direction = "stable"
    else:
        trend_direction = "stable"
    
    # Seasonal patterns
    peak_day = max(requests_by_day_of_week.items(), key=lambda x: x[1])[0] if requests_by_day_of_week else "Monday"
    peak_month = max(requests_by_month.items(), key=lambda x: x[1])[0] if requests_by_month else "January"
    if peak_month:
        # Extract month name from YYYY-MM format
        try:
            from datetime import datetime as dt
            peak_month = dt.strptime(peak_month, "%Y-%m").strftime("%B")
        except:
            pass
    
    predictive_insights = PredictiveInsights(
        volume_forecast_next_week=volume_forecast_next_week,
        trend_direction=trend_direction,
        seasonal_peak_day=peak_day,
        seasonal_peak_month=peak_month
    )
    
    # Build response
    response_data = AdvancedStatisticsResponse(
        total_requests=total_count,
        open_requests=open_count,
        in_progress_requests=in_progress_count,
        closed_requests=closed_count,
        requests_by_hour=requests_by_hour,
        requests_by_day_of_week=requests_by_day_of_week,
        requests_by_month=requests_by_month,
        avg_resolution_hours_by_category=avg_resolution_hours_by_category,
        hotspots=hotspots,
        geographic_center=geographic_center,
        geographic_spread_miles=geographic_spread_miles,
        total_coverage_sq_miles=total_coverage_sq_miles,
        avg_distance_from_center_miles=avg_distance_from_center_miles,
        furthest_request_miles=furthest_request_miles,
        requests_density_by_zone={},
        department_metrics=department_metrics,
        top_staff_by_resolutions=top_staff_by_resolutions,
        avg_resolution_hours=avg_resolution_hours,
        avg_first_response_hours=None,  # Would need audit log analysis
        backlog_by_age=backlog_by_age,
        resolution_rate=resolution_rate,
        backlog_by_priority=backlog_by_priority,
        workload_by_staff=workload_by_staff,
        open_by_age_sla=open_by_age_sla,
        predictive_insights=predictive_insights,
        cost_estimates=cost_estimates,
        avg_response_time_hours=None,  # Would need comment/audit log analysis
        repeat_locations=repeat_locations,
        aging_high_priority_count=aging_high_priority_count,
        requests_by_category=requests_by_category,
        flagged_count=flagged_count,
        weekly_trend=weekly_trend,
        monthly_trend=monthly_trend,
        cached_at=now
    )
    
    # Cache the result
    try:
        if redis_client:
            cache_data = response_data.model_dump()
            cache_data["cached_at"] = now.isoformat()
            await redis_client.setex(cache_key, STATS_CACHE_TTL, json.dumps(cache_data, default=str))
    except Exception:
        pass
    
    return response_data


# ============ System Update ============


@router.post("/update")
async def update_system(_: User = Depends(get_current_admin)):
    """Pull updates from GitHub (admin only). Code changes reload automatically."""
    try:
        # Get the project root
        project_root = os.environ.get("PROJECT_ROOT", "/project")
        
        # Add safe directory to fix ownership issues in Docker
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", project_root],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Pull latest code
        pull_result = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if pull_result.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Git pull failed: {pull_result.stderr}"
            )
        
        # Check what was updated
        git_output = pull_result.stdout.strip()
        
        # Determine if restart is needed
        needs_restart = any(x in git_output.lower() for x in [
            'requirements.txt', 'dockerfile', 'docker-compose', 'package.json'
        ])
        
        return {
            "status": "success",
            "message": "Updates pulled successfully. " + (
                "Container restart may be needed for dependency changes." 
                if needs_restart 
                else "Code changes will reload automatically."
            ),
            "git_output": git_output,
            "needs_restart": needs_restart
        }
    
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Update operation timed out"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============ Custom Domain ============

@router.post("/domain/configure")
async def configure_domain(
    domain: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Configure custom domain with automatic HTTPS via Caddy"""
    import re
    import httpx
    
    # Validate domain format
    domain = domain.strip().lower()
    domain_regex = r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
    if not re.match(domain_regex, domain):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid domain format"
        )
    
    # Save domain to settings
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()
    if settings:
        settings.custom_domain = domain
        await db.commit()
    
    # Generate Caddyfile with custom domain (Caddy auto-handles HTTPS)
    caddyfile_content = f"""# Global options - enable admin API for auto-reload
{{
    admin 0.0.0.0:2019
}}

# Caddy configuration for Township 311
# Auto-generated - Custom domain: {domain}

# Custom domain with automatic HTTPS
{domain} {{
    # API routes
    handle /api/* {{
        reverse_proxy backend:8000
    }}

    # Frontend - SPA routing
    handle {{
        reverse_proxy frontend:5173
    }}

    encode gzip

    header {{
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }}
}}

# Also keep IP access on HTTP for fallback
:80 {{
    handle /api/* {{
        reverse_proxy backend:8000
    }}
    handle {{
        reverse_proxy frontend:5173
    }}
    encode gzip
}}
"""
    
    # Write Caddyfile to shared volume
    caddyfile_path = os.environ.get("PROJECT_ROOT", "/project") + "/Caddyfile"
    
    try:
        with open(caddyfile_path, 'w') as f:
            f.write(caddyfile_content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write Caddyfile: {str(e)}"
        )
    
    # Try to reload Caddy via its admin API
    reload_success = False
    reload_message = ""
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try to load the new Caddyfile config
            response = await client.post(
                "http://caddy:2019/load",
                content=caddyfile_content,
                headers={"Content-Type": "text/caddyfile"}
            )
            if response.status_code == 200:
                reload_success = True
                reload_message = "Caddy reloaded - HTTPS will be active shortly!"
            else:
                reload_message = f"Caddy API returned {response.status_code}. Container restart may be needed."
    except Exception as e:
        reload_message = f"Caddyfile saved but could not reload Caddy automatically. Please run: docker-compose restart caddy"
    
    return {
        "status": "success" if reload_success else "partial",
        "message": f"Domain {domain} configured! {reload_message}",
        "domain": domain,
        "url": f"https://{domain}",
        "reload_success": reload_success,
        "next_step": None if reload_success else "Run: docker-compose restart caddy"
    }


@router.get("/domain/status")
async def get_domain_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Get current domain configuration status"""
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()
    
    return {
        "custom_domain": settings.custom_domain if settings else None,
        "server_ip": "132.226.32.116"
    }


# ============ Image Upload ============

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/project/uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(get_current_staff)
):
    """Upload an image file (staff only). Returns the URL to access it."""
    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    
    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Save file
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    # Return URL (relative to API)
    return {
        "url": f"/api/uploads/{unique_filename}",
        "filename": unique_filename
    }

