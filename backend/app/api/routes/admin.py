from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.models.issue import IssueCategory
from app.models.settings import ApiCredential, BrandingAsset, GeoBoundary, NotificationTemplate, TownshipSetting
from app.schemas.issue import IssueCategoryCreate, IssueCategoryRead, IssueCategoryUpdate
from app.schemas.settings import BrandingUpdate, GeoBoundaryUpload, SecretsPayload
from app.services import gis
from app.utils.storage import save_file

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


@router.get("/branding", response_model=dict)
async def get_branding(session: AsyncSession = Depends(get_db)) -> dict:
    stmt = select(TownshipSetting).where(TownshipSetting.key == "branding")
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    return record.value if record else {}


@router.put("/branding", response_model=dict)
async def update_branding(payload: BrandingUpdate, session: AsyncSession = Depends(get_db)) -> dict:
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
    return data


@router.post("/branding/assets/{asset_key}", response_model=dict)
async def upload_asset(asset_key: str, file: UploadFile = File(...), session: AsyncSession = Depends(get_db)) -> dict:
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
    return {"key": asset_key, "file_path": path}


@router.get("/categories", response_model=list[IssueCategoryRead])
async def list_categories(session: AsyncSession = Depends(get_db)) -> list[IssueCategoryRead]:
    result = await session.execute(select(IssueCategory))
    return [IssueCategoryRead.model_validate(cat) for cat in result.scalars().all()]


@router.post("/categories", response_model=IssueCategoryRead)
async def create_category(payload: IssueCategoryCreate, session: AsyncSession = Depends(get_db)) -> IssueCategoryRead:
    category = IssueCategory(**payload.model_dump())
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return IssueCategoryRead.model_validate(category)


@router.put("/categories/{category_id}", response_model=IssueCategoryRead)
async def update_category(category_id: int, payload: IssueCategoryUpdate, session: AsyncSession = Depends(get_db)) -> IssueCategoryRead:
    category = await session.get(IssueCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    await session.commit()
    await session.refresh(category)
    return IssueCategoryRead.model_validate(category)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, session: AsyncSession = Depends(get_db)) -> dict:
    category = await session.get(IssueCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    await session.delete(category)
    await session.commit()
    return {"status": "ok"}


@router.post("/secrets", response_model=dict)
async def store_secret(payload: SecretsPayload, session: AsyncSession = Depends(get_db)) -> dict:
    cred = ApiCredential(provider=payload.provider, key=payload.key, secret=payload.secret, metadata=payload.metadata or {})
    session.add(cred)
    await session.commit()
    return {"id": str(cred.id)}


@router.delete("/secrets/{secret_id}")
async def delete_secret(secret_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    stmt = delete(ApiCredential).where(ApiCredential.id == secret_id)
    await session.execute(stmt)
    await session.commit()
    return {"status": "deleted"}


@router.post("/geo-boundary", response_model=dict)
async def upload_boundary(payload: GeoBoundaryUpload, session: AsyncSession = Depends(get_db)) -> dict:
    boundary = GeoBoundary(name=payload.name, geojson=payload.geojson, is_active=True)
    session.add(boundary)
    await session.commit()
    return {"id": boundary.id}


@router.get("/templates", response_model=list[dict])
async def list_templates(session: AsyncSession = Depends(get_db)) -> list[dict]:
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
async def upsert_template(payload: dict, session: AsyncSession = Depends(get_db)) -> dict:
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
    return {"slug": slug}
