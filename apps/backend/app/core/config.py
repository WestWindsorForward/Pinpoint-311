from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, BaseSettings, Field, HttpUrl, model_validator


class TownshipBranding(BaseModel):
    hero_headline: str | None = None
    hero_subtitle: str | None = None


class TownshipConfig(BaseModel):
    name: str
    primary_color: str
    secondary_color: str
    timezone: str
    logo_path: str | None = None


class JurisdictionConfig(BaseModel):
    name: str
    type: str
    roads: list[str] = Field(default_factory=list)


class IssueCategoryConfig(BaseModel):
    code: str
    label: str
    description: str | None = None
    default_priority: str | None = None
    default_department: str | None = None


class NotificationConfig(BaseModel):
    email_sender: str | None = None
    sms_sender: str | None = None
    webhook_timeout_seconds: int = 10


class Open311Config(BaseModel):
    jurisdiction_id: str
    endpoint_url: HttpUrl | None = None
    api_key: str | None = None


class FeatureFlagsConfig(BaseModel):
    enable_sms: bool = False
    enable_email: bool = True
    enable_ai_priority: bool = True
    require_completion_photo: bool = False


class AppConfiguration(BaseModel):
    township: TownshipConfig
    jurisdictions: list[JurisdictionConfig] = Field(default_factory=list)
    issue_categories: list[IssueCategoryConfig] = Field(default_factory=list)
    notification: NotificationConfig = Field(default_factory=NotificationConfig)
    open311: Open311Config | None = None
    feature_flags: FeatureFlagsConfig = Field(default_factory=FeatureFlagsConfig)
    branding: TownshipBranding | None = None


class Settings(BaseSettings):
    app_env: str = Field(default="production", alias="APP_ENV")
    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    redis_url: str | None = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    public_base_url: str = Field(default="http://localhost", alias="PUBLIC_BASE_URL")
    google_maps_api_key: str | None = Field(default=None, alias="GOOGLE_MAPS_API_KEY")
    township_config_path: str = Field(default="config/township.yaml", alias="TOWNSHIP_CONFIG_PATH")
    uploads_dir: str = Field(default="uploads", alias="UPLOADS_DIR")
    open311_endpoint_url: str | None = Field(default=None, alias="OPEN311_ENDPOINT_URL")
    open311_api_key: str | None = Field(default=None, alias="OPEN311_API_KEY")
    mailgun_api_key: str | None = Field(default=None, alias="MAILGUN_API_KEY")
    mailgun_domain: str | None = Field(default=None, alias="MAILGUN_DOMAIN")
    mailgun_from_email: str | None = Field(default=None, alias="MAILGUN_FROM_EMAIL")
    twilio_account_sid: str | None = Field(default=None, alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str | None = Field(default=None, alias="TWILIO_AUTH_TOKEN")
    twilio_messaging_service_sid: str | None = Field(default=None, alias="TWILIO_MESSAGING_SERVICE_SID")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int | None = Field(default=587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from_email: str | None = Field(default=None, alias="SMTP_FROM_EMAIL")
    google_vertex_ai_endpoint: str | None = Field(default=None, alias="GOOGLE_VERTEX_AI_ENDPOINT")
    google_vertex_ai_project: str | None = Field(default=None, alias="GOOGLE_VERTEX_AI_PROJECT")
    google_vertex_ai_location: str | None = Field(default=None, alias="GOOGLE_VERTEX_AI_LOCATION")
    google_vertex_ai_model: str | None = Field(default=None, alias="GOOGLE_VERTEX_AI_MODEL")
    google_application_credentials: str | None = Field(default=None, alias="GOOGLE_APPLICATION_CREDENTIALS")
    township_config: AppConfiguration | None = None

    class Config:
        env_file = ".env.local"
        env_file_encoding = "utf-8"
        extra = "allow"

    @model_validator(mode="after")
    def load_township_config(self) -> "Settings":
        if self.township_config is not None:
            return self

        config_path = Path(self.township_config_path)
        if not config_path.exists():
            raise FileNotFoundError(f"Township config not found at {config_path}")

        with config_path.open("r", encoding="utf-8") as fp:
            data: dict[str, Any] = yaml.safe_load(fp) or {}

        self.township_config = AppConfiguration.model_validate(data)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
