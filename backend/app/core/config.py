from functools import lru_cache
from typing import Any, List

from pydantic import AnyHttpUrl, BaseModel, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class BrandingConfig(BaseModel):
    town_name: str = "Your Township"
    hero_text: str = "Welcome to Your Township Request Portal"
    primary_color: str = "#0F172A"
    secondary_color: str = "#38BDF8"
    logo_url: str | None = None
    seal_url: str | None = None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    project_name: str = "Township Request Management System"
    environment: str = "local"
    api_v1_prefix: str = "/api"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/township"
    redis_url: str = "redis://localhost:6379/0"
    redis_rate_limit_url: str | None = None

    backend_cors_origins: List[AnyHttpUrl] = []

    access_token_expire_minutes: int = 60 * 24
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    admin_api_key: str = "dev-admin-key"
    refresh_token_expire_days: int = 30
    rate_limit_resident_per_minute: int = 30
    rate_limit_public_per_minute: int = 60

    storage_dir: str = "./storage"

    clamav_host: str = "clamav"
    clamav_port: int = 3310

    google_maps_api_key: str | None = None
    twilio_api_key: str | None = None
    mailgun_api_key: str | None = None
    vertex_ai_project: str | None = None
    vertex_ai_location: str = "us-central1"
    vertex_ai_model: str = "gemini-1.5-flash-002"

    vault_enabled: bool = False
    vault_addr: str | None = None
    vault_token: str | None = None
    vault_kv_mount: str = "secret"
    otel_enabled: bool = False
    otel_endpoint: str | None = None
    otel_headers: str | None = None

    developer_report_email: str = "311reports@westwindsorforward.org"
    heartbeat_day_of_week: int = 0  # Monday

    outbound_webhook_secret: str = ""

    branding: BrandingConfig = BrandingConfig()

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v: Any) -> List[AnyHttpUrl]:
        if isinstance(v, str) and v:
            return [origin.strip() for origin in v.split(",")]
        if isinstance(v, list):
            return v
        return []


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]


settings = get_settings()
