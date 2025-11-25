import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class UserRole(str, enum.Enum):
    resident = "resident"
    staff = "staff"
    admin = "admin"


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(255))
    phone_number: Mapped[str | None] = mapped_column(String(32))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.resident)
    department: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    must_reset_password: Mapped[bool] = mapped_column(Boolean, default=False)

    department_links = relationship(
        "StaffDepartmentLink", back_populates="user", cascade="all,delete-orphan"
    )
    departments = relationship(
        "Department",
        secondary="staff_department_links",
        primaryjoin="User.id==StaffDepartmentLink.user_id",
        secondaryjoin="StaffDepartmentLink.department_id==Department.id",
        viewonly=True,
    )

    submitted_requests = relationship("ServiceRequest", back_populates="resident", cascade="all,delete", foreign_keys="ServiceRequest.resident_id")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all,delete-orphan")

    @property
    def department_slugs(self) -> list[str]:
        return [
            link.department.slug
            for link in self.department_links
            if link.department and link.department.slug
        ]


class StaffDepartmentLink(Base):
    __tablename__ = "staff_department_links"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    user = relationship("User", back_populates="department_links")
    department = relationship("Department")
