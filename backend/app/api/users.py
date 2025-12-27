from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.db.session import get_db
from app.models import User
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.core.auth import get_password_hash, get_current_admin

router = APIRouter()


@router.get("/", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """List all users (admin only)"""
    result = await db.execute(
        select(User)
        .options(selectinload(User.departments))
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Create a new user (admin only)"""
    from app.models import Department
    
    # Check for existing username
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check for existing email
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    
    user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role.value,
        is_active=True
    )
    
    # Assign departments if provided
    if user_data.department_ids:
        result = await db.execute(
            select(Department).where(Department.id.in_(user_data.department_ids))
        )
        departments = result.scalars().all()
        user.departments = list(departments)
    
    db.add(user)
    await db.commit()
    
    # Reload with departments relationship for response
    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.departments))
    )
    return result.scalar_one()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Get user by ID (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Update user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            if field == "role":
                value = value.value
            setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Delete user (admin only)"""
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/reset-password", response_model=UserResponse)
async def reset_password(
    user_id: int,
    new_password: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Reset user password (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.hashed_password = get_password_hash(new_password)
    await db.commit()
    await db.refresh(user)
    return user


from pydantic import BaseModel

class PasswordResetRequest(BaseModel):
    new_password: str


@router.post("/{user_id}/reset-password-json", response_model=UserResponse)
async def reset_password_json(
    user_id: int,
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin)
):
    """Reset user password via JSON body (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    await db.refresh(user)
    return user

