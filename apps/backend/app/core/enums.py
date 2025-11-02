from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    WORKER = "worker"


class RequestStatus(str, enum.Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class RequestPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EMERGENCY = "emergency"


class NoteVisibility(str, enum.Enum):
    PUBLIC = "public"
    INTERNAL = "internal"


class NotificationMethod(str, enum.Enum):
    EMAIL = "email"
    SMS = "sms"


class AttachmentType(str, enum.Enum):
    INITIAL = "initial"
    COMPLETION = "completion"
    OTHER = "other"


class WebhookDeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
