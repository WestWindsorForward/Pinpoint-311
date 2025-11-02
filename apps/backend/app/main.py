from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, health, resident, staff
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Township Request Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(resident.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(staff.router, prefix="/api")


@app.get("/api/public/config")
async def public_config() -> dict:
    config = settings.township_config  # type: ignore[union-attr]
    return {
        "township": config.township.model_dump(),
        "branding": config.branding.model_dump() if config.branding else None,
        "feature_flags": config.feature_flags.model_dump(),
        "issue_categories": [category.model_dump() for category in config.issue_categories],
    }


app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")
