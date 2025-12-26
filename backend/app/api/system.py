from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
import subprocess
import os

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
    """List all secrets (names only, admin only)"""
    result = await db.execute(select(SystemSecret))
    return result.scalars().all()


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


# ============ System Update ============

@router.post("/update")
async def update_system(_: User = Depends(get_current_admin)):
    """Pull updates from GitHub and rebuild (admin only)"""
    try:
        # Get the project root (assuming backend is in /app in container)
        project_root = os.environ.get("PROJECT_ROOT", "/app/..")
        
        # Add safe directory to fix ownership issues in Docker
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", project_root],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Also add root as safe (for mounted volumes)
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", "/"],
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
        
        # Trigger rebuild via docker-compose
        rebuild_result = subprocess.run(
            ["docker-compose", "build", "--no-cache"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        # Restart services
        restart_result = subprocess.run(
            ["docker-compose", "up", "-d"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        return {
            "status": "success",
            "message": "Update initiated. Services will restart momentarily.",
            "git_output": pull_result.stdout,
            "rebuild_output": rebuild_result.stdout if rebuild_result.returncode == 0 else None
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
