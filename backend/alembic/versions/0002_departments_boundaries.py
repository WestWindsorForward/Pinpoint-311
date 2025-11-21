"""add departments table and boundary metadata

Revision ID: 0002_departments_boundaries
Revises: 0001_initial
Create Date: 2025-11-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002_departments_boundaries"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("contact_email", sa.String(length=255)),
        sa.Column("contact_phone", sa.String(length=64)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.add_column("geo_boundaries", sa.Column("kind", sa.String(length=32), nullable=True))
    op.add_column("geo_boundaries", sa.Column("redirect_url", sa.String(length=512), nullable=True))
    op.add_column("geo_boundaries", sa.Column("notes", sa.Text(), nullable=True))
    op.execute("UPDATE geo_boundaries SET kind='primary'")
    op.alter_column("geo_boundaries", "kind", nullable=False)


def downgrade() -> None:
    op.drop_column("geo_boundaries", "notes")
    op.drop_column("geo_boundaries", "redirect_url")
    op.drop_column("geo_boundaries", "kind")
    op.drop_table("departments")
