import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    phone_number: str | None = None


class AdminBootstrapRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserReadWithRole(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: UserRole
    department: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
