"""add category and road exclusion tables

Revision ID: 0006_exclusion_tables
Revises: 0005_staff_department_links
Create Date: 2025-11-29
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0006_exclusion_tables"
down_revision = "0005_staff_department_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_exclusions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("category_slug", sa.String(length=128), nullable=False, index=True),
        sa.Column("redirect_name", sa.String(length=255), nullable=True),
        sa.Column("redirect_url", sa.String(length=512), nullable=True),
        sa.Column("redirect_message", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "road_exclusions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("road_name", sa.String(length=255), nullable=False, index=True),
        sa.Column("redirect_name", sa.String(length=255), nullable=True),
        sa.Column("redirect_url", sa.String(length=512), nullable=True),
        sa.Column("redirect_message", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("road_exclusions")
    op.drop_table("category_exclusions")

