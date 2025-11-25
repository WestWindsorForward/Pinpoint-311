import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    display_name: str
    role: UserRole
    department: str | None = None
    department_slugs: list[str] = Field(default_factory=list)
    phone_number: str | None = None


class UserCreate(UserBase):
    password: str
    department_slugs: list[str] | None = None


class UserUpdate(BaseModel):
    display_name: str | None = None
    role: UserRole | None = None
    department: str | None = None
    department_slugs: list[str] | None = None
    phone_number: str | None = None
    is_active: bool | None = None
    password: str | None = None


class UserRead(UserBase):
    id: uuid.UUID
    is_active: bool
    must_reset_password: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
