import uuid

from pydantic import BaseModel, EmailStr


class DepartmentBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    is_active: bool | None = None


class DepartmentRead(DepartmentBase):
    id: uuid.UUID

    class Config:
        from_attributes = True
