from __future__ import annotations

from sqlalchemy import Enum, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RequestPriority

from .base import Base, TimestampMixin


class IssueCategory(Base, TimestampMixin):
    __tablename__ = "issue_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    default_priority: Mapped[RequestPriority] = mapped_column(
        Enum(RequestPriority, native_enum=False), default=RequestPriority.MEDIUM
    )
    default_department: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Jurisdiction(Base, TimestampMixin):
    __tablename__ = "jurisdictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    roads: Mapped[list[str]] = mapped_column(JSON, default=list)
