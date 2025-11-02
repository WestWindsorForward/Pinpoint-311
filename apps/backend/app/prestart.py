from __future__ import annotations

import asyncio
import logging
import secrets
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.enums import RequestPriority, UserRole
from app.core.security import get_password_hash
from app.models import IssueCategory, Jurisdiction, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    settings = get_settings()
    uploads_path = Path(settings.uploads_dir)
    uploads_path.mkdir(parents=True, exist_ok=True)
    logger.info("Uploads directory ensured at %s", uploads_path.resolve())

    async with AsyncSessionLocal() as session:
        await _seed_issue_categories(session)
        await _seed_jurisdictions(session)
        await session.commit()

    async with AsyncSessionLocal() as session:
        await _ensure_admin_user(session)
        await session.commit()


async def _seed_issue_categories(session) -> None:
    settings = get_settings()
    categories_config = settings.township_config.issue_categories  # type: ignore[union-attr]
    existing = await session.execute(select(IssueCategory))
    existing_map = {category.code: category for category in existing.scalars()}

    for category in categories_config:
        if category.code in existing_map:
            db_category = existing_map[category.code]
            db_category.label = category.label
            db_category.description = category.description
            try:
                db_category.default_priority = RequestPriority((category.default_priority or "medium").lower())
            except ValueError:
                db_category.default_priority = RequestPriority.MEDIUM
            db_category.default_department = category.default_department
        else:
            try:
                priority = RequestPriority((category.default_priority or "medium").lower())
            except ValueError:
                priority = RequestPriority.MEDIUM
            session.add(
                IssueCategory(
                    code=category.code,
                    label=category.label,
                    description=category.description,
                    default_priority=priority,
                    default_department=category.default_department,
                )
            )

    logger.info("Issue categories synchronized (%d total)", len(categories_config))


async def _seed_jurisdictions(session) -> None:
    settings = get_settings()
    jurisdictions_config = settings.township_config.jurisdictions  # type: ignore[union-attr]
    existing = await session.execute(select(Jurisdiction))
    existing_map = {jurisdiction.name: jurisdiction for jurisdiction in existing.scalars()}

    for jurisdiction in jurisdictions_config:
        if jurisdiction.name in existing_map:
            db_jurisdiction = existing_map[jurisdiction.name]
            db_jurisdiction.type = jurisdiction.type
            db_jurisdiction.roads = jurisdiction.roads
        else:
            session.add(
                Jurisdiction(
                    name=jurisdiction.name,
                    type=jurisdiction.type,
                    roads=jurisdiction.roads,
                )
            )

    logger.info("Jurisdictions synchronized (%d total)", len(jurisdictions_config))


async def _ensure_admin_user(session) -> None:
    result = await session.execute(select(User).where(User.role == UserRole.ADMIN))
    admin = result.scalar_one_or_none()
    if admin:
        return

    temp_password = secrets.token_urlsafe(12)
    hashed = get_password_hash(temp_password)
    admin_user = User(
        email="admin@exampletownship.gov",
        full_name="Township Administrator",
        role=UserRole.ADMIN,
        password_hash=hashed,
    )
    session.add(admin_user)
    await session.flush()
    print(f"Temporary admin account created. Email: {admin_user.email}, Temporary Password: {temp_password}")


if __name__ == "__main__":
    asyncio.run(main())
