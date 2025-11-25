"""add jurisdiction metadata to geo boundaries

Revision ID: 0003_geo_boundary_scope
Revises: 0002_departments_boundaries
Create Date: 2025-11-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0003_geo_boundary_scope"
down_revision = "0002_departments_boundaries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("geo_boundaries", sa.Column("jurisdiction", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("geo_boundaries", "jurisdiction")
