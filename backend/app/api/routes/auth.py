from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_roles
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models.auth import RefreshToken
from app.models.user import User, UserRole
from app.schemas.auth import (
    AdminBootstrapRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserReadWithRole,
)
from app.schemas.user import UserCreate, UserRead

router = APIRouter(prefix=f"{settings.api_v1_prefix}/auth", tags=["Auth"])


async def _issue_tokens(
    session: AsyncSession,
    user: User,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    access_token = create_access_token(str(user.id), extra={"role": user.role.value})
    raw_refresh, refresh_hash, expires_at = create_refresh_token()

    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=expires_at,
    )
    session.add(refresh_record)
    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(payload: RegisterRequest, session: AsyncSession = Depends(get_db)) -> UserRead:
    stmt = select(User).where(User.email == payload.email.lower())
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        display_name=payload.display_name,
        role=UserRole.resident,
        phone_number=payload.phone_number,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserRead.model_validate(user)


@router.post("/bootstrap-admin", response_model=UserReadWithRole)
async def bootstrap_admin(
    payload: AdminBootstrapRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> UserReadWithRole:
    api_key = request.headers.get("X-Admin-Key")
    if api_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap key")
    email = payload.email.lower()
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user:
        user.password_hash = get_password_hash(payload.password)
        user.display_name = payload.display_name
        user.role = UserRole.admin
        user.is_active = True
    else:
        user = User(
            email=email,
            password_hash=get_password_hash(payload.password),
            display_name=payload.display_name,
            role=UserRole.admin,
            is_active=True,
        )
        session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserReadWithRole.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    stmt = select(User).where(User.email == form.username.lower())
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")

    return await _issue_tokens(
        session,
        user,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(payload: RefreshRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    token_hash_value = hash_token(payload.refresh_token)
    stmt = (
        select(RefreshToken, User)
        .join(User, RefreshToken.user_id == User.id)
        .where(RefreshToken.token_hash == token_hash_value, RefreshToken.revoked.is_(False))
    )
    result = await session.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    record, user = row
    if record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    record.revoked = True
    await session.flush()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer active")

    return await _issue_tokens(session, user)


@router.post("/logout")
async def logout(payload: RefreshRequest, session: AsyncSession = Depends(get_db)) -> dict:
    token_hash_value = hash_token(payload.refresh_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash_value, RefreshToken.revoked.is_(False))
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()
    if record:
        record.revoked = True
        await session.commit()
    return {"status": "ok"}


@router.post("/logout-all")
async def logout_all(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> dict:
    stmt = select(RefreshToken).where(RefreshToken.user_id == current_user.id, RefreshToken.revoked.is_(False))
    result = await session.execute(stmt)
    for token in result.scalars().all():
        token.revoked = True
    await session.commit()
    return {"status": "ok"}


@router.get("/me", response_model=UserReadWithRole)
async def me(current_user: User = Depends(get_current_user)) -> UserReadWithRole:
    return UserReadWithRole.model_validate(current_user)


@router.post("/invite", response_model=UserReadWithRole)
async def invite_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> UserReadWithRole:
    stmt = select(User).where(User.email == payload.email.lower())
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        department=payload.department,
        phone_number=payload.phone_number,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserReadWithRole.model_validate(user)
