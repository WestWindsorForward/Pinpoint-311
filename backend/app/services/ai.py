from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, TypedDict

from vertexai import generative_models, init as vertexai_init

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import runtime_config
from app.services.secrets import get_credentials

logger = logging.getLogger(__name__)


class AIAnalysis(TypedDict, total=False):
    severity: int
    recommended_category: str
    dimensions: dict[str, Any]
    confidence: float
    raw: dict[str, Any]


async def analyze_request(
    description: str,
    media_urls: list[str] | None = None,
    *,
    session: AsyncSession | None = None,
) -> AIAnalysis:
    """Run an AI triage workflow; fall back to heuristic if Vertex AI unavailable."""

    vertex_project = await runtime_config.get_value("vertex_ai_project", settings.vertex_ai_project)
    vertex_model = await runtime_config.get_value("vertex_ai_model", settings.vertex_ai_model)
    vertex_location = await runtime_config.get_value("vertex_ai_location", settings.vertex_ai_location)
    service_account_info: dict[str, Any] | None = None
    if session:
        cred = await get_credentials(session, "vertex-ai")
        if cred and cred.secret:
            try:
                service_account_info = json.loads(cred.secret)
            except json.JSONDecodeError:
                logger.warning("Vertex AI secret is not valid JSON; falling back to ADC.")

    if vertex_project and vertex_model:
        try:
            def _call_vertex() -> AIAnalysis:
                kwargs: dict[str, Any] = {"project": vertex_project, "location": vertex_location}
                credentials = _build_vertex_credentials(service_account_info)
                if credentials:
                    kwargs["credentials"] = credentials
                vertexai_init(**kwargs)
                model = generative_models.GenerativeModel(
                    vertex_model,
                    system_instruction=(
                        "You are an operations analyst helping township staff triage 311 style service requests. "
                        "Return structured JSON so downstream systems can route work without any free text."
                    ),
                )
                media_context = ""
                if media_urls:
                    joined = ", ".join(media_urls)
                    media_context = f"\nResident supplied media URLs: {joined}"
                prompt = (
                    "Respond strictly with JSON including keys: "
                    "severity (1-10), recommended_category (slug), dimensions (object), and confidence (0-1)."
                    f"\nResident description:\n{description}{media_context}"
                )
                response = model.generate_content(
                    [
                        generative_models.Content(
                            parts=[
                                generative_models.Part.from_text(prompt),
                            ]
                        )
                    ],
                    generation_config=generative_models.GenerationConfig(
                        temperature=0.2,
                        top_p=0.95,
                        response_mime_type="application/json",
                    ),
                )
                text = "{}"
                if response.candidates:
                    parts = response.candidates[0].content.parts
                    if parts:
                        text = parts[0].text or "{}"
                payload = json.loads(text)
                payload.setdefault("severity", 5)
                payload.setdefault("recommended_category", "general")
                return payload  # type: ignore[return-value]

            return await asyncio.to_thread(_call_vertex)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Vertex AI analysis failed: %s", exc)

    return heuristic_triage(description)


def heuristic_triage(description: str) -> AIAnalysis:
    severity = 3
    recommended_category = "general"
    lowered = description.lower()
    if any(word in lowered for word in ["pothole", "sinkhole"]):
        severity = 7
        recommended_category = "pothole"
    elif any(word in lowered for word in ["graffiti", "vandal"]):
        severity = 4
        recommended_category = "graffiti"
    elif "flood" in lowered or "water" in lowered:
        severity = 8
        recommended_category = "flooding"

    return AIAnalysis(severity=severity, recommended_category=recommended_category, dimensions={}, confidence=0.4)


def _build_vertex_credentials(service_account_info: dict[str, Any] | None):
    if service_account_info:
        from google.oauth2 import service_account

        return service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    try:  # pragma: no cover - requires GCP environment
        import google.auth

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        return credentials
    except Exception:
        return None
