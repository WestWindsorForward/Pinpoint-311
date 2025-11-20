# Security Hardening Features

## Secrets Management
- The backend can read provider credentials from Postgres (`api_credentials`) or HashiCorp Vault.
- Enable Vault by setting:
  ```
  VAULT_ENABLED=true
  VAULT_ADDR=https://vault.yourtown.gov
  VAULT_TOKEN=<token>
  VAULT_KV_MOUNT=secret  # or your mount name
  ```
- Secrets are expected under `/<mount>/<provider>` (e.g., `secret/data/smtp`) with fields like `key`, `secret`, and optional `metadata`.

## Rate Limiting
- Redis-backed token bucket enforced via middleware for public Open311 endpoints and resident submissions.
- Defaults come from `RATE_LIMIT_PUBLIC_PER_MINUTE` and `RATE_LIMIT_RESIDENT_PER_MINUTE`.
- Override `REDIS_RATE_LIMIT_URL` if you want an isolated Redis cluster for rate limiting.

## Attachment Scanning
- All uploaded media (resident attachments, completion photos) are streamed through ClamAV (`clamav` service in Compose).
- Configure host/port via `CLAMAV_HOST` / `CLAMAV_PORT` if running ClamAV externally.
- Malicious uploads are rejected with HTTP 400.

## Audit Logging
- Every privileged action (branding changes, secrets updates, category edits, staff status changes, closures) is persisted to the `audit_events` table.
- Fields captured: actor ID/role, action, entity type/id, timestamp, IP, and optional metadata.
- Use this table to power compliance exports or SIEM ingestion.
