from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent
from app.models.user import User


async def log_event(
    session: AsyncSession,
    *,
    action: str,
    actor: User | None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    request: Request | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    ip = request.client.host if request and request.client else None
    event = AuditEvent(
        actor_id=actor.id if actor else None,
        actor_role=actor.role.value if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip_address=ip,
        metadata=metadata,
    )
    session.add(event)
    await session.commit()
