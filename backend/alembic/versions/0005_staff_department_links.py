"""Add staff department link table and password reset flag."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_staff_department_links"
down_revision: Union[str, None] = "0004_geo_boundary_service_filters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("must_reset_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "staff_department_links",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("department_id", sa.UUID(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "department_id"),
    )
    op.execute("ALTER TABLE users ALTER COLUMN must_reset_password DROP DEFAULT")


def downgrade() -> None:
    op.drop_table("staff_department_links")
    op.drop_column("users", "must_reset_password")
