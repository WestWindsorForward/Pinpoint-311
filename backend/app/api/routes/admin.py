import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.core.security import get_password_hash
from app.models.issue import IssueCategory
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
    GeoBoundaryRead,
    GeoBoundaryUpload,
    RuntimeConfigUpdate,
    SecretsPayload,
)
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import gis, runtime_config as runtime_config_service
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
    stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    data = record.value if record else {}
    data.update(payload.model_dump(exclude_unset=True))
    if record:
        record.value = data
    else:
        record = TownshipSetting(key="branding", value=data)
        session.add(record)
    await session.commit()
    await log_event(session, action="branding.update", actor=current_user, request=request, metadata=data)
    return data


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
    await _ensure_department_slug(session, payload.department)
    existing = await session.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        email=payload.email.lower(),
        display_name=payload.display_name,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        department=payload.department,
        phone_number=payload.phone_number,
        is_active=True,
    )
    session.add(user)
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
    await _ensure_department_slug(session, update_data.get("department"))
    if "password" in update_data:
        user.password_hash = get_password_hash(update_data.pop("password"))  # type: ignore[arg-type]
    for key, value in update_data.items():
        setattr(user, key, value)
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
    config = await runtime_config_service.update_runtime_config(session, payload.model_dump(exclude_unset=True))
    await log_event(
        session,
        action="runtime_config.update",
        actor=current_user,
        entity_type="runtime_config",
        entity_id="runtime_config",
        request=request,
        metadata=payload.model_dump(exclude_unset=True),
    )
    return config
