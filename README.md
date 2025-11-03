# Township Request Management System

West Windsor Forward's reference implementation for an on-premises resident service request portal. The system ships as a self-contained Docker Compose deployment bundling the public PWA, staff tools, API, database, background worker, and reverse proxy.

## Architecture Overview

- **Resident Portal (PWA)** ? Vite + React frontend served statically through Nginx and proxied by Caddy. Residents can submit issues, attach photos, receive triage guidance, and track requests by ID.
- **Staff Portal** ? Authenticated React experience for administrators, managers, and workers. Supports RBAC, dashboards, filtering, status changes, assignments, notes, and attachment management.
- **Core API** ? FastAPI service with PostgreSQL persistence and async SQLAlchemy models. Provides Open311-inspired endpoints, audit logging, notification hooks, and attachment storage.
- **Background Workers** ? Celery running on Redis handles outbound Open311 webhooks and is extensible for queued notifications.
- **Database** ? PostgreSQL 15 with Alembic migrations for reproducible schema management.
- **Reverse Proxy** ? Caddy routes `/api` traffic to the backend and serves frontend assets, applying security headers by default.

## One-Command Deployment

```bash
./setup.sh
```

The helper script:

1. Ensures Docker and Compose v2 are installed.
2. Creates `.env.local` from `.env.example` on first run.
3. Validates `config/township.yaml` sanity (requires PyYAML; otherwise prints a warning).
4. Builds all service images and brings the stack online (`docker compose up -d --build`).
5. Waits for the backend healthcheck to pass, then surfaces the temporary admin credentials if this is the first boot.

### Default URLs

- Resident portal: `http://localhost/`
- Staff portal: `http://localhost/staff`
- API health: `http://localhost/api/health`

Override the exposed ports or host bindings by editing `docker-compose.yml` or the Caddyfile if required by Township IT.

## Configuration

All runtime configuration is environment-driven and consolidated in two files:

1. `.env.local` ? secrets and integration credentials (JWT secret, database user, Mailgun/Twilio keys, Vertex AI endpoint, etc.). Never commit this file.
2. `config/township.yaml` ? non-secret deployment metadata (township name, colours, categories, jurisdiction road lists, feature flags).

Upon startup the backend seeds lookup tables (`issue_categories`, `jurisdictions`) from the YAML file and ensures an administrator exists. The first admin is created with a random, logged password and the email `admin@exampletownship.gov`. Change this immediately after logging in.

### External Integrations

- **Mapping** ? Provide `VITE_GOOGLE_MAPS_API_KEY` (and optionally `GOOGLE_MAPS_API_KEY` for backend services) in `.env.local` so residents can drop map pins. Without a key, the form falls back to manual address entry.
- **Email / SMS** ? Configure Mailgun and Twilio credentials (or SMTP fallback) to enable outbound notifications when statuses change. The system respects resident opt-in choices.
- **Vertex AI** ? Supply your Google application credentials alongside `GOOGLE_VERTEX_AI_PROJECT`, `GOOGLE_VERTEX_AI_LOCATION`, and `GOOGLE_VERTEX_AI_MODEL` (e.g., `gemini-1.5-flash`). The backend will invoke Vertex AI Gemini to auto-classify priority and department; without these settings it falls back to category defaults.
- **Open311 Webhooks** ? Set `OPEN311_ENDPOINT_URL` and optional API key to push status changes into Township asset management tools. Webhook deliveries are retried asynchronously by Celery.

## Services

| Service        | Description                                     | Ports |
| -------------- | ----------------------------------------------- | ----- |
| `reverse-proxy`| Caddy reverse proxy / TLS termination           | 80/443 |
| `backend`      | FastAPI app (Uvicorn)                           | internal |
| `frontend`     | Nginx serving compiled PWA                      | internal |
| `worker`       | Celery worker for webhooks/notifications        | ? |
| `scheduler`    | Celery beat scheduler (future recurring jobs)   | ? |
| `db`           | PostgreSQL 15                                   | internal |
| `redis`        | Redis 7 (Celery broker/backend)                 | internal |

Volumes persist database state, Redis data, admin-uploaded attachments (`uploads_data`), and Caddy certificates/config.

## Backend Development

- Dependencies are pinned in `apps/backend/requirements.txt`.
- Alembic migrations live under `apps/backend/alembic/`. Generate new revisions with `alembic revision --autogenerate -m "message"` (remember to activate the project virtualenv and set `DATABASE_URL`).
- Run the app locally without Docker by creating a virtualenv, installing requirements, exporting env vars, and starting `uvicorn app.main:app --reload`.

## Frontend Development

- Install Node 20+, then `npm install` within `apps/frontend`.
- Run `npm run dev` for local Vite development (defaults to port 5173). Set `VITE_API_BASE=http://localhost:8000/api` for direct backend access.
- Build the production bundle with `npm run build`; output is emitted to `apps/frontend/dist/` and consumed by the Docker image.

## Security & Compliance

- Passwords use Argon2id hashing (via `argon2-cffi`).
- JWT secrets, API tokens, and third-party credentials are never committed to source control.
- The entire system runs on Township-controlled infrastructure; no West Windsor Forward cloud resources are required.
- Code is licensed under the MIT License to minimise liability exposure.

## Operational Notes

- Uploaded media live under the `uploads/` directory (mounted into the backend and worker containers). Ensure the underlying host storage is backed up per Township retention policies.
- Open311 webhook deliveries and notification attempts are recorded in the database for traceability.
- Celery beat is provisioned for future scheduled exports or reminder workflows.

## Troubleshooting

- `docker compose logs backend` ? inspect API logs (admin creation, errors, webhook attempts).
- `docker compose logs worker` ? verify Celery is dispatching webhooks/notifications.
- `docker compose exec db psql -U township` ? interact with the PostgreSQL database.
- Use `setup.sh` to re-run configuration validation or to restart the stack after configuration updates.

## Contributing

1. Fork or branch from `cursor/deploy-township-request-management-system-158c`.
2. Run the full stack locally via Docker Compose.
3. Add or update tests (PyTest for backend, component tests as needed for frontend).
4. Ensure linting/type-checking passes (`ruff`/`mypy`/`npm run build`).
5. Submit a PR describing changes, testing steps, and rollout considerations.
