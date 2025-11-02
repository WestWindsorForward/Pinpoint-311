from __future__ import annotations

import uuid

from pydantic import EmailStr, Field

from app.core.enums import UserRole

from .base import ORMModel


class UserCreate(ORMModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None
    phone_number: str | None = None
    role: UserRole = UserRole.WORKER


class UserUpdate(ORMModel):
    full_name: str | None = None
    phone_number: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    phone_number: str | None
    role: UserRole
    is_active: bool


class TokenResponse(ORMModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(ORMModel):
    email: EmailStr
    password: str
