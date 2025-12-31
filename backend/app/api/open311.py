from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import uuid

from app.db.session import get_db
from app.models import ServiceRequest, ServiceDefinition, User
from app.schemas import (
    ServiceRequestCreate, ServiceRequestResponse, ServiceRequestDetailResponse,
    ServiceRequestUpdate, ServiceRequestDelete, ManualIntakeCreate, PublicServiceRequestResponse
)
from app.core.auth import get_current_staff

router = APIRouter()


def generate_request_id() -> str:
    """Generate unique request ID"""
    timestamp = datetime.now().strftime("%Y%m%d")
    unique = uuid.uuid4().hex[:8].upper()
    return f"REQ-{timestamp}-{unique}"


@router.get("/public/requests", response_model=List[PublicServiceRequestResponse])
async def list_public_requests(
    status: Optional[str] = Query(None, description="Filter by status"),
    service_code: Optional[str] = Query(None, description="Filter by service category"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Public endpoint - List all requests WITHOUT personal information"""
    query = select(ServiceRequest).where(ServiceRequest.deleted_at.is_(None))
    
    if status:
        query = query.where(ServiceRequest.status == status)
    if service_code:
        query = query.where(ServiceRequest.service_code == service_code)
    
    query = query.order_by(ServiceRequest.requested_datetime.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    requests = result.scalars().all()
    
    # Return public response without PII, truncate description for privacy
    return [
        PublicServiceRequestResponse(
            service_request_id=r.service_request_id,
            service_code=r.service_code,
            service_name=r.service_name,
            description=r.description[:200] + "..." if len(r.description) > 200 else r.description,
            status=r.status,
            address=r.address,
            lat=r.lat,
            long=r.long,
            requested_datetime=r.requested_datetime,
            updated_datetime=r.updated_datetime,
            closed_substatus=r.closed_substatus,
        )
        for r in requests
    ]


@router.get("/services.json")
async def list_open311_services(db: AsyncSession = Depends(get_db)):
    """Open311 v2 compatible - List services"""
    result = await db.execute(
        select(ServiceDefinition).where(ServiceDefinition.is_active == True)
    )
    services = result.scalars().all()
    return [
        {
            "service_code": s.service_code,
            "service_name": s.service_name,
            "description": s.description,
            "type": "realtime",
            "keywords": s.service_name.lower(),
            "group": "municipal"
        }
        for s in services
    ]


@router.post("/requests.json", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_request(
    request_data: ServiceRequestCreate,
    db: AsyncSession = Depends(get_db)
):
    """Open311 v2 compatible - Create a new service request (public)"""
    # Validate service code
    result = await db.execute(
        select(ServiceDefinition).where(
            ServiceDefinition.service_code == request_data.service_code,
            ServiceDefinition.is_active == True
        )
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid service code"
        )
    
    # Create request
    service_request = ServiceRequest(
        service_request_id=generate_request_id(),
        service_code=request_data.service_code,
        service_name=service.service_name,
        description=request_data.description,
        address=request_data.address,
        lat=request_data.lat,
        long=request_data.long,
        first_name=request_data.first_name,
        last_name=request_data.last_name,
        email=request_data.email,
        phone=request_data.phone,
        media_url=request_data.media_url,
        matched_asset=request_data.matched_asset,
        source="resident_portal"
    )
    
    db.add(service_request)
    await db.commit()
    await db.refresh(service_request)
    
    # TODO: Trigger Celery task for AI analysis
    # from app.tasks.service_requests import analyze_request
    # analyze_request.delay(service_request.id)
    
    return service_request


@router.get("/requests.json", response_model=List[ServiceRequestResponse])
async def list_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    service_code: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_staff)
):
    """Open311 v2 compatible - List service requests (staff only)"""
    query = select(ServiceRequest).order_by(ServiceRequest.requested_datetime.desc())
    
    # Filter out deleted unless admin requests them
    if not include_deleted or current_user.role != "admin":
        query = query.where(ServiceRequest.deleted_at.is_(None))
    
    if status_filter:
        query = query.where(ServiceRequest.status == status_filter)
    
    if service_code:
        query = query.where(ServiceRequest.service_code == service_code)
    
    if start_date:
        query = query.where(ServiceRequest.requested_datetime >= start_date)
    
    if end_date:
        query = query.where(ServiceRequest.requested_datetime <= end_date)
    
    result = await db.execute(query.limit(100))
    return result.scalars().all()


@router.get("/requests/{request_id}.json", response_model=ServiceRequestDetailResponse)
async def get_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_staff)
):
    """Get service request details (staff only)"""
    result = await db.execute(
        select(ServiceRequest).where(ServiceRequest.service_request_id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return request


@router.put("/requests/{request_id}/status", response_model=ServiceRequestDetailResponse)
async def update_request_status(
    request_id: str,
    update_data: ServiceRequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_staff)
):
    """Update service request status (staff only)"""
    result = await db.execute(
        select(ServiceRequest).where(ServiceRequest.service_request_id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    update_dict = update_data.model_dump(exclude_unset=True)
    
    for field, value in update_dict.items():
        if value is not None:
            if field == "status":
                value = value.value
                if value == "closed" and request.status != "closed":
                    request.closed_datetime = datetime.utcnow()
            elif field == "closed_substatus":
                value = value.value  # Convert enum to string
            setattr(request, field, value)
    
    request.updated_datetime = datetime.utcnow()
    
    await db.commit()
    await db.refresh(request)
    return request


@router.post("/requests/manual", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_intake(
    intake_data: ManualIntakeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_staff)
):
    """Create a request from manual intake (phone/walk-in) - staff only"""
    # Validate service code
    result = await db.execute(
        select(ServiceDefinition).where(
            ServiceDefinition.service_code == intake_data.service_code,
            ServiceDefinition.is_active == True
        )
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid service code"
        )
    
    service_request = ServiceRequest(
        service_request_id=generate_request_id(),
        service_code=intake_data.service_code,
        service_name=service.service_name,
        description=intake_data.description,
        address=intake_data.address,
        first_name=intake_data.first_name,
        last_name=intake_data.last_name,
        email=intake_data.email or f"manual-{uuid.uuid4().hex[:8]}@intake.local",
        phone=intake_data.phone,
        source=intake_data.source.value
    )
    
    db.add(service_request)
    await db.commit()
    await db.refresh(service_request)
    return service_request


@router.delete("/requests/{request_id}")
async def delete_request(
    request_id: str,
    delete_data: ServiceRequestDelete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_staff)
):
    """Soft delete a service request with justification (staff/admin)"""
    result = await db.execute(
        select(ServiceRequest).where(ServiceRequest.service_request_id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.deleted_at:
        raise HTTPException(status_code=400, detail="Request already deleted")
    
    # Soft delete
    request.deleted_at = datetime.utcnow()
    request.deleted_by = current_user.username
    request.delete_justification = delete_data.justification
    request.updated_datetime = datetime.utcnow()
    
    await db.commit()
    await db.refresh(request)
    
    return {"message": "Request deleted", "request_id": request_id}
