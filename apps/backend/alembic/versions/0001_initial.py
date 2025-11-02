"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2025-11-02 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role_enum = sa.Enum("admin", "manager", "worker", name="userrole", native_enum=False)
    request_status_enum = sa.Enum("new", "in_progress", "resolved", "closed", name="requeststatus", native_enum=False)
    request_priority_enum = sa.Enum("low", "medium", "high", "emergency", name="requestpriority", native_enum=False)
    note_visibility_enum = sa.Enum("public", "internal", name="notevisibility", native_enum=False)
    notification_method_enum = sa.Enum("email", "sms", name="notificationmethod", native_enum=False)
    attachment_type_enum = sa.Enum("initial", "completion", "other", name="attachmenttype", native_enum=False)
    webhook_status_enum = sa.Enum("pending", "success", "failed", name="webhookdeliverystatus", native_enum=False)

    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("phone_number", sa.String(length=32), nullable=True),
        sa.Column("role", user_role_enum, nullable=False, server_default="worker"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "issue_categories",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("default_priority", request_priority_enum, nullable=False, server_default="medium"),
        sa.Column("default_department", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("code", name="uq_issue_categories_code"),
    )

    op.create_table(
        "jurisdictions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("roads", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.UniqueConstraint("name", name="uq_jurisdictions_name"),
    )

    op.create_table(
        "requests",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("public_id", sa.String(length=12), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", request_status_enum, nullable=False, server_default="new"),
        sa.Column("priority", request_priority_enum, nullable=False, server_default="medium"),
        sa.Column("category_code", sa.String(length=64), nullable=True),
        sa.Column("submitter_name", sa.String(length=255), nullable=True),
        sa.Column("submitter_email", sa.String(length=255), nullable=True),
        sa.Column("submitter_phone", sa.String(length=32), nullable=True),
        sa.Column("location_lat", sa.Float(), nullable=True),
        sa.Column("location_lng", sa.Float(), nullable=True),
        sa.Column("location_address", sa.String(length=512), nullable=True),
        sa.Column("jurisdiction", sa.String(length=255), nullable=True),
        sa.Column("assigned_department", sa.String(length=255), nullable=True),
        sa.Column("assigned_to_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("initial_photo_path", sa.String(length=512), nullable=True),
        sa.Column("completion_photo_path", sa.String(length=512), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_priority", sa.String(length=32), nullable=True),
        sa.Column("ai_department", sa.String(length=255), nullable=True),
        sa.Column("external_metadata", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("public_id", name="uq_requests_public_id"),
    )
    op.create_index("ix_requests_public_id", "requests", ["public_id"], unique=True)

    op.create_table(
        "request_notes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("visibility", note_visibility_enum, nullable=False, server_default="public"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "request_status_history",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_status", request_status_enum, nullable=True),
        sa.Column("to_status", request_status_enum, nullable=False),
        sa.Column("changed_by_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "request_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("file_type", attachment_type_enum, nullable=False, server_default="other"),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "notification_opt_ins",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("method", notification_method_enum, nullable=False),
        sa.Column("target", sa.String(length=255), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("actor_user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action_type", sa.String(length=128), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_url", sa.String(length=512), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", webhook_status_enum, nullable=False, server_default="pending"),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("webhook_deliveries")
    op.drop_table("audit_logs")
    op.drop_table("notification_opt_ins")
    op.drop_table("request_attachments")
    op.drop_table("request_status_history")
    op.drop_table("request_notes")
    op.drop_table("requests")
    op.drop_table("jurisdictions")
    op.drop_table("issue_categories")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    sa.Enum(name="webhookdeliverystatus").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="attachmenttype").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="notificationmethod").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="notevisibility").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="requestpriority").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="requeststatus").drop(op.get_bind(), checkfirst=False)
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=False)
