# Township Request Management System

Modern, Open311-compliant 311 platform designed for on-prem deployments. The mono-repo includes a FastAPI backend, React/Vite frontend, Celery background workers, and Docker Compose infrastructure tuned for Scale HC3 clusters.

## Project Layout

- `backend/` – FastAPI, SQLAlchemy (async), Celery workers, AI/GIS/communications services.
- `frontend/` – React + Vite + Tailwind + Framer Motion resident portal, admin console, and staff command center.
- `infrastructure/` – Docker Compose stack (PostgreSQL, Redis, backend API, Celery worker/beat, frontend build, Caddy proxy).
- `docs/` – Architecture notes.

## Quickstart (local dev)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

Set environment variables using `backend/.env.example`. (`ADMIN_API_KEY` remains for legacy tooling, but runtime auth now relies on JWT access/refresh tokens.)

## Authentication

- Residents can self-register via `POST /api/auth/register` (or through the UI when available).
- Staff/Admins authenticate via `/api/auth/login` (handled by the `/login` page in the frontend). Responses include short-lived access tokens plus refresh tokens.
- Protected APIs now require `Authorization: Bearer <access_token>`; refresh tokens can be rotated via `POST /api/auth/refresh`.
- Admins can invite staff accounts through `POST /api/auth/invite` (requires admin role).

## Docker Compose

```bash
cd infrastructure
cp .env.example .env
docker compose up --build
```

Caddy will expose everything on `http://localhost` with `/api/*` routed to FastAPI.

## Custom Domains

To serve the stack from `311.yourtown.gov` (with automatic HTTPS), set `APP_DOMAIN` and `TLS_EMAIL` in `infrastructure/.env`, point your DNS record to the server, and restart the Compose stack. See `docs/CUSTOM_DOMAIN.md` for detailed instructions.

## Security & Compliance

- **Secrets**: Credentials can be stored in Postgres or pulled dynamically from HashiCorp Vault via `VAULT_*` env vars.
- **Rate limiting**: Redis-backed guardrails for Open311 and resident submissions (`RATE_LIMIT_*` settings).
- **Attachment scanning**: All uploads are scanned by ClamAV (provided via the `clamav` service).
- **Audit trails**: Admin/staff actions are persisted to `audit_events` for compliance reviews.
- See `docs/SECURITY_HARDENING.md` for configuration details.
