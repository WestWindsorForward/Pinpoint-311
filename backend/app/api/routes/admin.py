import secrets
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.core.security import get_password_hash
from app.models.issue import IssueCategory, ServiceRequest
from app.models.settings import (
    ApiCredential,
    BrandingAsset,
    GeoBoundary,
    NotificationTemplate,
    TownshipSetting,
)
from app.models.settings import BoundaryKind
from app.models.user import Department, User, UserRole
from app.schemas.department import DepartmentCreate, DepartmentRead, DepartmentUpdate
from app.schemas.issue import IssueCategoryCreate, IssueCategoryRead, IssueCategoryUpdate
from app.schemas.settings import (
    BrandingUpdate,
    GeoBoundaryGoogleImport,
    GeoBoundaryRead,
    GeoBoundaryUpload,
    RuntimeConfigUpdate,
    SecretsPayload,
)
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import gis, google_maps, runtime_config as runtime_config_service, settings_snapshot
from app.services.staff_accounts import sync_staff_departments
from app.services.audit import log_event
from app.utils.storage import public_storage_url, save_file

router = APIRouter(prefix="/admin", tags=["Admin"])


def _normalize_slug(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace(" ", "-")
        .replace("_", "-")
    )


async def _ensure_department_slug(session: AsyncSession, slug: str | None) -> None:
    if not slug:
        return
    result = await session.execute(select(Department).where(Department.slug == slug))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Department not found")


async def _department_name(session: AsyncSession, slug: str | None) -> str | None:
    if not slug:
        return None
    result = await session.execute(select(Department).where(Department.slug == slug))
    department = result.scalar_one_or_none()
    return department.name if department else None


def _category_response(category: IssueCategory, department_name: str | None) -> IssueCategoryRead:
    payload = IssueCategoryRead.model_validate(category)
    if department_name is not None:
        payload = payload.model_copy(update={"department_name": department_name})
    return payload
@router.get("/branding", response_model=dict)
async def get_branding(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    return record.value if record else {}


@router.put("/branding", response_model=dict)
async def update_branding(
    payload: BrandingUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        payload_dict = payload.model_dump(exclude_unset=True)
        logger.info(f"[BRANDING] Updating branding: {payload_dict}")
        
        # Get or create branding record
        stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()
        
        if record:
            logger.info(f"[BRANDING] Found existing record with value: {record.value}")
            data = record.value if isinstance(record.value, dict) else {}
            data.update(payload_dict)
            record.value = data
        else:
            logger.info("[BRANDING] Creating new branding record")
            data = payload_dict
            record = TownshipSetting(key="branding", value=data)
            session.add(record)
        
        # Commit and flush to database
        await session.flush()
        await session.commit()
        
        # Verify it was saved
        verify_stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
        verify_result = await session.execute(verify_stmt)
        verify_record = verify_result.scalar_one_or_none()
        
        if verify_record:
            logger.info(f"[BRANDING] ✅ VERIFIED - Data in database: {verify_record.value}")
            final_data = verify_record.value
        else:
            logger.error("[BRANDING] ❌ VERIFICATION FAILED - Data not in database!")
            raise HTTPException(status_code=500, detail="Branding saved but verification failed")
        
        settings_snapshot.save_snapshot("branding", final_data)
        await log_event(session, action="branding.update", actor=current_user, request=request, metadata=final_data)
        
        return final_data
        
    except Exception as e:
        logger.error(f"[BRANDING] ❌ ERROR: {str(e)}", exc_info=True)
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save branding: {str(e)}")


@router.post("/branding/assets/{asset_key}", response_model=dict)
async def upload_asset(
    asset_key: str,
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    path = save_file(f"branding-{asset_key}-{file.filename}", await file.read())
    stmt = select(BrandingAsset).where(BrandingAsset.key == asset_key)
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    if record:
        record.file_path = path
        record.content_type = file.content_type
    else:
        session.add(BrandingAsset(key=asset_key, file_path=path, content_type=file.content_type))
    await session.commit()
    await log_event(
        session,
        action="branding.asset.upload",
        actor=current_user,
        entity_type="branding_asset",
        entity_id=asset_key,
        request=request,
    )
    return {
        "key": asset_key,
        "file_path": path,
        "url": public_storage_url(request, path),
    }


@router.get("/departments", response_model=list[DepartmentRead])
async def list_departments(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[DepartmentRead]:
    result = await session.execute(select(Department).order_by(Department.name))
    return [DepartmentRead.model_validate(dep) for dep in result.scalars().all()]


@router.post("/departments", response_model=DepartmentRead)
async def create_department(
    payload: DepartmentCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> DepartmentRead:
    slug = _normalize_slug(payload.slug or payload.name)
    existing = await session.execute(select(Department).where(Department.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already exists")
    department = Department(
        slug=slug,
        name=payload.name,
        description=payload.description,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        is_active=payload.is_active,
    )
    session.add(department)
    await session.commit()
    await log_event(
        session,
        action="department.create",
        actor=current_user,
        entity_type="department",
        entity_id=str(department.id),
        request=None,
        metadata=payload.model_dump(),
    )
    return DepartmentRead.model_validate(department)


@router.put("/departments/{department_id}", response_model=DepartmentRead)
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> DepartmentRead:
    department = await session.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "slug" in update_data:
        update_data["slug"] = _normalize_slug(update_data["slug"])
    for key, value in update_data.items():
        setattr(department, key, value)
    await session.commit()
    await session.refresh(department)
    await log_event(
        session,
        action="department.update",
        actor=current_user,
        entity_type="department",
        entity_id=str(department.id),
        request=None,
        metadata=update_data,
    )
    return DepartmentRead.model_validate(department)


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    department = await session.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    await session.delete(department)
    await session.commit()
    await log_event(
        session,
        action="department.delete",
        actor=current_user,
        entity_type="department",
        entity_id=str(department.id),
        request=None,
    )
    return {"status": "deleted"}


@router.get("/categories", response_model=list[IssueCategoryRead])
async def list_categories(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[IssueCategoryRead]:
    result = await session.execute(select(IssueCategory))
    categories = result.scalars().all()
    dept_slugs = {cat.default_department_slug for cat in categories if cat.default_department_slug}
    lookup: dict[str, str] = {}
    if dept_slugs:
        deps = await session.execute(select(Department).where(Department.slug.in_(dept_slugs)))
        lookup = {dep.slug: dep.name for dep in deps.scalars().all()}
    return [_category_response(cat, lookup.get(cat.default_department_slug)) for cat in categories]


@router.post("/categories", response_model=IssueCategoryRead)
async def create_category(
    payload: IssueCategoryCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> IssueCategoryRead:
    data = payload.model_dump()
    data["slug"] = _normalize_slug(data["slug"])
    await _ensure_department_slug(session, data.get("default_department_slug"))
    category = IssueCategory(**data)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    await log_event(
        session,
        action="category.create",
        actor=current_user,
        entity_type="issue_category",
        entity_id=str(category.id),
        request=request,
        metadata=payload.model_dump(),
    )
    dept_name = await _department_name(session, category.default_department_slug)
    return _category_response(category, dept_name)


@router.put("/categories/{category_id}", response_model=IssueCategoryRead)
async def update_category(
    category_id: int,
    payload: IssueCategoryUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> IssueCategoryRead:
    category = await session.get(IssueCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    update_data = payload.model_dump(exclude_unset=True)
    await _ensure_department_slug(session, update_data.get("default_department_slug"))
    for key, value in update_data.items():
        setattr(category, key, value)
    await session.commit()
    await session.refresh(category)
    await log_event(
        session,
        action="category.update",
        actor=current_user,
        entity_type="issue_category",
        entity_id=str(category.id),
        request=request,
        metadata=payload.model_dump(exclude_unset=True),
    )
    dept_name = await _department_name(session, category.default_department_slug)
    return _category_response(category, dept_name)


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    category = await session.get(IssueCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    await session.delete(category)
    await session.commit()
    await log_event(
        session,
        action="category.delete",
        actor=current_user,
        entity_type="issue_category",
        entity_id=str(category_id),
        request=request,
    )
    return {"status": "ok"}


@router.post("/secrets", response_model=dict)
async def store_secret(
    payload: SecretsPayload,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    cred = ApiCredential(provider=payload.provider, key=payload.key, secret=payload.secret, meta=payload.metadata or {})
    session.add(cred)
    await session.commit()
    await log_event(
        session,
        action="secret.store",
        actor=current_user,
        entity_type="api_credential",
        entity_id=str(cred.id),
        request=request,
        metadata={"provider": payload.provider},
    )
    return {"id": str(cred.id)}


@router.delete("/secrets/{secret_id}")
async def delete_secret(
    secret_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    stmt = delete(ApiCredential).where(ApiCredential.id == secret_id)
    await session.execute(stmt)
    await session.commit()
    await log_event(
        session,
        action="secret.delete",
        actor=current_user,
        entity_type="api_credential",
        entity_id=secret_id,
        request=request,
    )
    return {"status": "deleted"}


@router.get("/secrets", response_model=list[dict])
async def list_secrets(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[dict]:
    result = await session.execute(select(ApiCredential))
    credentials = result.scalars().all()
    return [
        {
            "id": str(cred.id),
            "provider": cred.provider,
            "created_at": cred.created_at,
            "metadata": cred.meta or {},
        }
        for cred in credentials
    ]


@router.get("/staff", response_model=list[UserRead])
async def list_staff(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[UserRead]:
    stmt = select(User).where(User.role != UserRole.resident).order_by(User.display_name)
    result = await session.execute(stmt)
    return [UserRead.model_validate(user) for user in result.scalars().all()]


@router.post("/staff", response_model=UserRead)
async def create_staff(
    payload: UserCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> UserRead:
    if payload.role == UserRole.resident:
        raise HTTPException(status_code=400, detail="Staff role must be staff or admin")
    existing = await session.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")
    target_slugs = payload.department_slugs or ([payload.department] if payload.department else [])
    user = User(
        email=payload.email.lower(),
        display_name=payload.display_name,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        phone_number=payload.phone_number,
        is_active=True,
        must_reset_password=True,
    )
    session.add(user)
    try:
        await sync_staff_departments(session, user, target_slugs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    await log_event(
        session,
        action="staff.create",
        actor=current_user,
        entity_type="user",
        entity_id=str(user.id),
        request=None,
        metadata={"email": user.email, "role": user.role.value},
    )
    return UserRead.model_validate(user)


@router.put("/staff/{user_id}", response_model=UserRead)
async def update_staff(
    user_id: uuid.UUID,
    payload: UserUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> UserRead:
    user = await session.get(User, user_id)
    if not user or user.role == UserRole.resident:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if payload.role == UserRole.resident:
        raise HTTPException(status_code=400, detail="Invalid role")
    update_data = payload.model_dump(exclude_unset=True)
    department_slugs = update_data.pop("department_slugs", None)
    await _ensure_department_slug(session, update_data.get("department"))
    if "password" in update_data:
        user.password_hash = get_password_hash(update_data.pop("password"))  # type: ignore[arg-type]
    for key, value in update_data.items():
        setattr(user, key, value)
    if department_slugs is None and "department" in update_data:
        fallback = update_data["department"]
        department_slugs = [fallback] if fallback else []
    try:
        await sync_staff_departments(session, user, department_slugs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    await session.refresh(user)
    await log_event(
        session,
        action="staff.update",
        actor=current_user,
        entity_type="user",
        entity_id=str(user.id),
        request=None,
        metadata=update_data,
    )
    return UserRead.model_validate(user)


@router.delete("/staff/{user_id}")
async def delete_staff(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    user = await session.get(User, user_id)
    if not user or user.role == UserRole.resident:
        raise HTTPException(status_code=404, detail="Staff member not found")
    await session.delete(user)
    await session.commit()
    await log_event(
        session,
        action="staff.delete",
        actor=current_user,
        entity_type="user",
        entity_id=str(user.id),
        request=None,
    )
    return {"status": "deleted"}


@router.post("/staff/{user_id}/reset-password")
async def reset_staff_password(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    user = await session.get(User, user_id)
    if not user or user.role == UserRole.resident:
        raise HTTPException(status_code=404, detail="Staff member not found")
    temp_password = secrets.token_urlsafe(12)
    user.password_hash = get_password_hash(temp_password)
    user.must_reset_password = True
    await session.commit()
    await log_event(
        session,
        action="staff.reset_password",
        actor=current_user,
        entity_type="user",
        entity_id=str(user.id),
        request=None,
        metadata={"forced_reset": True},
    )
    return {"temporary_password": temp_password}


@router.delete("/requests/{request_id}")
async def delete_service_request(
    request_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    service_request = await session.get(ServiceRequest, request_id)
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")
    await session.delete(service_request)
    await session.commit()
    await log_event(
        session,
        action="service_request.delete",
        actor=current_user,
        entity_type="service_request",
        entity_id=str(request_id),
        request=None,
    )
    return {"status": "deleted"}


@router.get("/geo-boundary", response_model=list[GeoBoundaryRead])
async def list_boundaries(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[GeoBoundaryRead]:
    result = await session.execute(select(GeoBoundary).order_by(GeoBoundary.updated_at.desc()))
    return [GeoBoundaryRead.model_validate(boundary) for boundary in result.scalars().all()]


@router.post("/geo-boundary", response_model=GeoBoundaryRead)
async def upload_boundary(
    payload: GeoBoundaryUpload,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> GeoBoundaryRead:
    if payload.kind == BoundaryKind.primary:
        await session.execute(
            update(GeoBoundary)
            .where(GeoBoundary.kind == BoundaryKind.primary)
            .values(is_active=False)
        )
    boundary = GeoBoundary(
        name=payload.name,
        geojson=payload.geojson,
        kind=payload.kind,
        jurisdiction=payload.jurisdiction,
        redirect_url=payload.redirect_url,
        notes=payload.notes,
        is_active=True,
        service_code_filters=payload.service_code_filters,
    )
    session.add(boundary)
    await session.commit()
    await session.refresh(boundary)
    await log_event(
        session,
        action="geo_boundary.upload",
        actor=current_user,
        entity_type="geo_boundary",
        entity_id=str(boundary.id),
        request=request,
        metadata={"name": payload.name, "kind": payload.kind.value},
    )
    return GeoBoundaryRead.model_validate(boundary)


@router.post("/geo-boundary/google", response_model=GeoBoundaryRead)
async def import_boundary_from_google(
    payload: GeoBoundaryGoogleImport,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> GeoBoundaryRead:
    try:
        suggested_name, geojson = await google_maps.fetch_boundary_from_google(
            query=payload.query,
            place_id=payload.place_id,
        )
    except google_maps.GoogleMapsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    boundary = GeoBoundary(
        name=payload.name or suggested_name,
        geojson=geojson,
        kind=payload.kind,
        jurisdiction=payload.jurisdiction,
        redirect_url=payload.redirect_url,
        notes=payload.notes,
        is_active=True,
        service_code_filters=payload.service_code_filters or [],
    )
    session.add(boundary)
    await session.commit()
    await session.refresh(boundary)
    await log_event(
        session,
        action="geo_boundary.import_google",
        actor=current_user,
        entity_type="geo_boundary",
        entity_id=str(boundary.id),
        request=request,
        metadata={
            "query": payload.query,
            "place_id": payload.place_id,
            "kind": payload.kind.value,
        },
    )
    return GeoBoundaryRead.model_validate(boundary)


@router.delete("/geo-boundary/{boundary_id}")
async def delete_boundary(
    boundary_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    boundary = await session.get(GeoBoundary, boundary_id)
    if not boundary:
        raise HTTPException(status_code=404, detail="Boundary not found")
    await session.delete(boundary)
    await session.commit()
    await log_event(
        session,
        action="geo_boundary.delete",
        actor=current_user,
        entity_type="geo_boundary",
        entity_id=str(boundary.id),
        request=None,
    )
    return {"status": "deleted"}


@router.get("/templates", response_model=list[dict])
async def list_templates(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[dict]:
    result = await session.execute(select(NotificationTemplate))
    return [
        {
            "id": template.id,
            "slug": template.slug,
            "subject": template.subject,
            "body": template.body,
            "channel": template.channel,
        }
        for template in result.scalars().all()
    ]


@router.post("/templates", response_model=dict)
async def upsert_template(
    payload: dict,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    slug = payload.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug required")
    stmt = select(NotificationTemplate).where(NotificationTemplate.slug == slug)
    result = await session.execute(stmt)
    template = result.scalar_one_or_none()
    if template:
        template.subject = payload.get("subject", template.subject)
        template.body = payload.get("body", template.body)
        template.channel = payload.get("channel", template.channel)
    else:
        template = NotificationTemplate(
            slug=slug,
            subject=payload.get("subject", ""),
            body=payload.get("body", ""),
            channel=payload.get("channel", "email"),
        )
        session.add(template)
    await session.commit()
    await log_event(
        session,
        action="template.upsert",
        actor=current_user,
        entity_type="notification_template",
        entity_id=str(template.id),
        request=request,
        metadata={"slug": slug},
    )
    return {"slug": slug}


@router.get("/runtime-config", response_model=dict)
async def get_runtime_config(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    return await runtime_config_service.get_runtime_config(session)


@router.put("/runtime-config", response_model=dict)
async def update_runtime_config(
    payload: RuntimeConfigUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        payload_dict = payload.model_dump(exclude_unset=True)
        logger.info(f"[RUNTIME] Updating runtime config: {payload_dict}")
        
        # Update config
        config = await runtime_config_service.update_runtime_config(session, payload_dict)
        
        # Verify it was saved
        verify_config = await runtime_config_service.get_runtime_config(session)
        logger.info(f"[RUNTIME] ✅ VERIFIED - Config in database: {verify_config}")
        
        settings_snapshot.save_snapshot("runtime_config", verify_config)
        
        await log_event(
            session,
            action="runtime_config.update",
            actor=current_user,
            entity_type="runtime_config",
            entity_id="runtime_config",
            request=request,
            metadata=payload_dict,
        )
        
        return verify_config
        
    except Exception as e:
        logger.error(f"[RUNTIME] ❌ ERROR: {str(e)}", exc_info=True)
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save runtime config: {str(e)}")


@router.post("/system/update", response_model=dict)
async def trigger_system_update(
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    """Trigger a system update by creating a flag file for the host watcher script."""
    import logging
    import os
    logger = logging.getLogger(__name__)
    
    try:
        flags_dir = Path("/app/flags")
        logger.info(f"[UPDATE] Checking flags directory: {flags_dir}")
        
        # Check if directory exists and is writable
        if not flags_dir.exists():
            logger.info(f"[UPDATE] Creating flags directory: {flags_dir}")
            flags_dir.mkdir(parents=True, exist_ok=True)
        
        # Check write permissions
        if not os.access(flags_dir, os.W_OK):
            logger.error(f"[UPDATE] ❌ No write permission to {flags_dir}")
            raise HTTPException(status_code=500, detail="Cannot write to flags directory")
        
        flag_file = flags_dir / "update_requested"
        logger.info(f"[UPDATE] System update triggered by {current_user.email}")
        logger.info(f"[UPDATE] Creating flag file at: {flag_file}")
        
        # Create the flag file
        flag_file.write_text(f"Update requested by {current_user.email} at {request.client.host if request.client else 'unknown'}")
        
        # Verify file was created
        if flag_file.exists():
            logger.info(f"[UPDATE] ✅ Flag file created successfully")
            logger.info(f"[UPDATE] File size: {flag_file.stat().st_size} bytes")
        else:
            logger.error(f"[UPDATE] ❌ Failed to create flag file")
            raise HTTPException(status_code=500, detail="Failed to create update flag file")
        
        # Log the event
        await log_event(
            session,
            action="system.update_triggered",
            actor=current_user,
            entity_type="system",
            entity_id="update",
            request=request,
        )
        await session.commit()
        
        return {
            "status": "update_initiated",
            "message": "Update flag created successfully. The watcher will process it shortly.",
            "flag_path": str(flag_file),
            "watcher_check_interval": "5 seconds",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UPDATE] ❌ ERROR: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trigger update: {str(e)}")
