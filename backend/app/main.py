from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.routes import admin, auth, open311, resident, staff
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.telemetry import configure_tracing
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


@app.get("/health", tags=["Health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
