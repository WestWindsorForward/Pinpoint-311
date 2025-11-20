# Architecture Overview

## Backend (FastAPI)
- **Open311 GeoReport v2** endpoints at `/open311/v2/*` with async SQLAlchemy models.
- **Admin API** for live branding, category editor, GeoJSON boundary uploads, and secrets management.
- **Resident Portal API** exposes branding config and submission endpoint with Google Maps boundary enforcement.
- **Staff Command Center API** for unified inbox, AI assist, PDF exports, completion-photo enforcement, and outbound webhooks.
- **Celery Workers**
  - `ai_triage_task` enriches requests via Vertex AI / heuristics.
  - `developer_heartbeat_task` emails weekly aggregate statistics (configurable recipient).
- **Services** for AI (Vertex Gemini 2.5 Flash), email (generic SMTP), SMS (generic webhook), PDF generation (ReportLab), and GIS (Shapely boundary check).

## Frontend (React + Vite)
- **Pages**: Resident Portal (PWA-style hero, categories, request form + Google Map picker), Township Settings (no-code configuration), Staff Command Center (real-time inbox + AI insights).
- **Branding**: Zustand store + CSS custom properties for live theme changes.
- **Data Fetching**: Axios + TanStack Query + React Hook Form; BYO admin key via `VITE_ADMIN_KEY`.
- **Animations**: Framer Motion for page transitions and cards.
- **Map Picker**: `@react-google-maps/api` integration, toggled via `VITE_GOOGLE_MAPS_KEY`.

## Infrastructure
- **PostgreSQL 15** for data sovereignty, **Redis 7** for Celery broker/result.
- **Backend** container runs FastAPI / Uvicorn.
- **Celery Worker + Beat** containers reuse backend image.
- **Frontend** container serves built assets via `serve`.
- **Caddy** edge proxy exposes `/api/*` -> backend, `/` -> frontend, enabling white-label deployment via HC3.

## Configuration & Secrets
- Admin console writes to `township_settings`, `branding_assets`, `api_credentials` tables.
- GIS boundary stored as GeoJSON and enforced before request creation.
- Notification templates stored in DB allowing rebranding of emails/SMS.
- Secrets stored encrypted-at-rest via Postgres (recommended to add envelope encryption for production deployments).

## Automated Developer Heartbeat
- Scheduled Celery beat triggers weekly report summarizing total requests, new submissions (7d), and category breakdown.
- Email target defaults to `311reports@westwindsorforward.org`, override with `DEVELOPER_REPORT_EMAIL` env or admin console secret.

## TODO / Future Enhancements
- Expand authentication/authorization beyond admin API key (SSO, staff accounts).
- Integrate proper queue for AI media uploads and attachments.
- Add PWA manifest/service-worker for offline caching.
- Build integration marketplace for outbound adapters (Cartegraph, Cityworks, etc.).
