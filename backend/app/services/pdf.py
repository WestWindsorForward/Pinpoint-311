from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.models.issue import ServiceRequest


def generate_case_pdf(request: ServiceRequest, storage_dir: Path) -> Path:
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"case-{request.external_id}.pdf"
    c = canvas.Canvas(str(file_path), pagesize=letter)
    text = c.beginText(72, 720)
    text.setFont("Helvetica", 12)
    text.textLine(f"Service Request #{request.external_id}")
    text.textLine(f"Category: {request.category.slug if request.category else 'Uncategorized'}")
    text.textLine(f"Status: {request.status}")
    text.textLine(f"Priority: {request.priority}")
    text.textLine(f"Description: {request.description[:200]}")
    if request.ai_analysis:
        text.textLine(f"AI Severity: {request.ai_analysis.get('severity')}")
        text.textLine(f"AI Category: {request.ai_analysis.get('recommended_category')}")
    c.drawText(text)
    c.showPage()
    c.save()
    return file_path
