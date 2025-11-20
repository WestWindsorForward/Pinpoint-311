from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session

admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)


async def get_db() -> AsyncSession:
    async for session in get_session():
        yield session


async def require_admin(api_key: str | None = Security(admin_key_header)) -> None:
    if not api_key or api_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key")
