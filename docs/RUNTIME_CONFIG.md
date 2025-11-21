# Runtime Config via Admin Portal

Admins can now update most environment-driven settings from the Township Settings UI (`/admin`). Values live in the database (encrypted at rest when using managed storage) instead of `.env` files, with environment variables acting as defaults/fallbacks.

## Editable Keys
| Setting | Description | Notes |
| --- | --- | --- |
| `google_maps_api_key` | Used by resident map picker | Propagates to Resident Portal automatically |
| `developer_report_email` | Destination for weekly heartbeat emails | Overrides `DEVELOPER_REPORT_EMAIL` |
| `vertex_ai_project/location/model` | Vertex AI Gemini connection | Overrides respective env vars before AI triage runs |
| `rate_limit_resident_per_minute` | Requests per minute per IP for resident + Open311 create | Default 30 |
| `rate_limit_public_per_minute` | Requests per minute per IP for Open311 service discovery | Default 60 |
| `otel_enabled/endpoint/headers` | Toggle OTLP tracing + endpoint headers | Set `otel_enabled=true` to start exporting |

Secret values (SMTP, SMS, etc.) still belong in the **Secrets** section, which stores credentials in `api_credentials` or HashiCorp Vault if enabled.

## Worker Behavior
- AI analysis, heartbeat emails, and rate limiting pull the runtime overrides dynamically; no restarts required.
- When keys are cleared in the UI, the system falls back to the original environment variables.

## Security Notes
- All runtime config writes are audit logged (`runtime_config.update`).
- Only admins can access the Runtime Config section; enforce MFA/SSO for these accounts.
- Ensure HTTPS is enabled (Caddy + custom domain) so keys are never sent over plain HTTP.
