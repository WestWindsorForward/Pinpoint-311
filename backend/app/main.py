from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.routes import admin, auth, open311, resident, staff
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.telemetry import configure_tracing
from app.services import settings_snapshot
from app.middleware.request_id import RequestIDMiddleware

configure_logging()

instrumentator = Instrumentator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    instrumentator.expose(app)
    configure_tracing(app)
    yield


app = FastAPI(title=settings.project_name, lifespan=lifespan)
instrumentator.instrument(app)
app.add_middleware(RequestIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.backend_cors_origins] or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(open311.router)
app.include_router(resident.router, prefix=settings.api_v1_prefix)
app.include_router(admin.router, prefix=settings.api_v1_prefix)
app.include_router(staff.router, prefix=settings.api_v1_prefix)
app.include_router(auth.router)

storage_path = Path(settings.storage_dir).resolve()
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_path), name="storage")


@app.on_event("startup")
async def restore_settings_from_disk() -> None:
    await settings_snapshot.bootstrap_from_disk()


@app.get("/health", tags=["Health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
