from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app.core.config import AppConfiguration, get_settings
from app.core.enums import RequestPriority

logger = logging.getLogger(__name__)

settings = get_settings()
config: AppConfiguration = settings.township_config  # type: ignore[assignment]


def _default_priority(category_code: str | None) -> tuple[RequestPriority, str | None]:
    for category in config.issue_categories:
        if category.code == category_code:
            priority_text = (category.default_priority or RequestPriority.MEDIUM.value).lower()
            dept = category.default_department
            try:
                mapped_priority = RequestPriority(priority_text)
            except ValueError:
                mapped_priority = RequestPriority.MEDIUM
            return mapped_priority, dept
    return RequestPriority.MEDIUM, None


def classify_request(description: str, category_code: str | None) -> tuple[RequestPriority, str | None, dict[str, Any] | None]:
    fallback_priority, fallback_department = _default_priority(category_code)

    if not settings.google_vertex_ai_endpoint:
        logger.info("Vertex AI endpoint not configured; using defaults")
        return fallback_priority, fallback_department, None

    access_token = _get_google_access_token()
    headers = {"Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    payload = {
        "instances": [
            {
                "text": description,
                "category": category_code,
                "jurisdiction": config.township.name,
            }
        ]
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(settings.google_vertex_ai_endpoint, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:  # pragma: no cover - best effort integration
        logger.warning("Vertex AI classification failed: %s", exc)
        return fallback_priority, fallback_department, None

    try:
        prediction = data["predictions"][0]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected Vertex AI response: %s", exc)
        return fallback_priority, fallback_department, data

    priority_value = prediction.get("priority") or fallback_priority.value
    department = prediction.get("department") or fallback_department

    try:
        priority = RequestPriority(priority_value.lower())
    except ValueError:
        logger.warning("Vertex AI returned unknown priority '%s'", priority_value)
        priority = fallback_priority

    return priority, department, data


def _get_google_access_token() -> str | None:
    if not settings.google_application_credentials:
        return None

    credentials_path = Path(settings.google_application_credentials)
    if not credentials_path.exists():
        logger.warning("Google credentials file not found at %s", credentials_path)
        return None

    creds = service_account.Credentials.from_service_account_file(
        credentials_path,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    creds.refresh(Request())
    return creds.token
