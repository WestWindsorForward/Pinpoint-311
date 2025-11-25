from __future__ import annotations

from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Department, StaffDepartmentLink, User


async def _ensure_department_slugs(session: AsyncSession, slugs: Iterable[str]) -> list[Department]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for slug in slugs:
        if not slug:
            continue
        value = slug.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    if not cleaned:
        return []
    stmt = select(Department).where(Department.slug.in_(cleaned))
    result = await session.execute(stmt)
    departments = result.scalars().all()
    found = {dept.slug for dept in departments}
    missing = [slug for slug in cleaned if slug not in found]
    if missing:
        missing_list = ", ".join(missing)
        raise ValueError(f"Department(s) not found: {missing_list}")
    by_slug = {dept.slug: dept for dept in departments}
    return [by_slug[slug] for slug in cleaned]


async def sync_staff_departments(session: AsyncSession, user: User, slugs: list[str] | None) -> None:
    if slugs is None:
        return
    try:
        departments = await _ensure_department_slugs(session, slugs)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc
    user.department_links = [
        StaffDepartmentLink(
            user_id=user.id,
            department_id=dept.id,
            is_primary=index == 0,
        )
        for index, dept in enumerate(departments)
    ]
    user.department = departments[0].slug if departments else None
