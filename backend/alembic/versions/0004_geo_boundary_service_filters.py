"""add service_code_filters to geo boundaries

Revision ID: 0004_geo_boundary_service_filters
Revises: 0003_geo_boundary_scope
Create Date: 2025-11-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0004_geo_boundary_service_filters"
down_revision = "0003_geo_boundary_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "geo_boundaries",
        sa.Column(
            "service_code_filters",
            sa.JSON(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("geo_boundaries", "service_code_filters")
