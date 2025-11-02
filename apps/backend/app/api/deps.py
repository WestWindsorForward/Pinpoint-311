from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import get_db
from app.core.enums import UserRole
from app.core.security import decode_access_token
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/staff/auth/login")
settings = get_settings()


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    try:
        uuid_user = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")

    result = await session.execute(select(User).where(User.id == uuid_user))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    return user


def require_role(required_roles: list[UserRole]):
    async def _inner(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in required_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _inner


async def get_admin_user(user: Annotated[User, Depends(require_role([UserRole.ADMIN]))]) -> User:
    return user


async def get_manager_user(user: Annotated[User, Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))]) -> User:
    return user


async def get_worker_user(
    user: Annotated[User, Depends(require_role([UserRole.ADMIN, UserRole.MANAGER, UserRole.WORKER]))]
) -> User:
    return user
