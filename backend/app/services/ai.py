from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, TypedDict

from app.core.config import settings
from app.services import runtime_config

logger = logging.getLogger(__name__)


class AIAnalysis(TypedDict, total=False):
    severity: int
    recommended_category: str
    dimensions: dict[str, Any]
    confidence: float
    raw: dict[str, Any]


async def analyze_request(description: str, media_urls: list[str] | None = None) -> AIAnalysis:
    """Run an AI triage workflow; fall back to heuristic if Vertex AI unavailable."""

    vertex_project = await runtime_config.get_value("vertex_ai_project", settings.vertex_ai_project)
    vertex_model = await runtime_config.get_value("vertex_ai_model", settings.vertex_ai_model)
    vertex_location = await runtime_config.get_value("vertex_ai_location", settings.vertex_ai_location)
    if vertex_project and vertex_model:
        try:
            from google.cloud import aiplatform

            def _call_vertex() -> AIAnalysis:
                aiplatform.init(project=vertex_project, location=vertex_location)
                model = aiplatform.GenerativeModel(vertex_model)
                prompt = (
                    "You are triaging civic service requests. "
                    "Return JSON with severity (1-10), recommended_category, dimensions (width_cm,height_cm,quantity), "
                    "and confidence (0-1)."
                )
                response = model.generate_content([
                    prompt,
                    {"mime_type": "text/plain", "text": description},
                ])
                text = response.text or "{}"
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
