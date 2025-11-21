from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.issue import IssueCategory
from app.models.settings import ApiCredential, BrandingAsset, GeoBoundary, NotificationTemplate, TownshipSetting
from app.models.user import User, UserRole
from app.schemas.issue import IssueCategoryCreate, IssueCategoryRead, IssueCategoryUpdate
from app.schemas.settings import BrandingUpdate, GeoBoundaryUpload, RuntimeConfigUpdate, SecretsPayload
from app.services import gis, runtime_config as runtime_config_service
from app.services.audit import log_event
from app.utils.storage import save_file

router = APIRouter(prefix="/admin", tags=["Admin"])


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
    return {"key": asset_key, "file_path": path}


@router.get("/categories", response_model=list[IssueCategoryRead])
async def list_categories(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> list[IssueCategoryRead]:
    result = await session.execute(select(IssueCategory))
    return [IssueCategoryRead.model_validate(cat) for cat in result.scalars().all()]


@router.post("/categories", response_model=IssueCategoryRead)
async def create_category(
    payload: IssueCategoryCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> IssueCategoryRead:
    category = IssueCategory(**payload.model_dump())
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
    return IssueCategoryRead.model_validate(category)


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
    for key, value in payload.model_dump(exclude_unset=True).items():
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
    return IssueCategoryRead.model_validate(category)


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


@router.post("/geo-boundary", response_model=dict)
async def upload_boundary(
    payload: GeoBoundaryUpload,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> dict:
    boundary = GeoBoundary(name=payload.name, geojson=payload.geojson, is_active=True)
    session.add(boundary)
    await session.commit()
    await log_event(
        session,
        action="geo_boundary.upload",
        actor=current_user,
        entity_type="geo_boundary",
        entity_id=str(boundary.id),
        request=request,
        metadata={"name": payload.name},
    )
    return {"id": boundary.id}


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
