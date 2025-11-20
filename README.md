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

Set environment variables using `backend/.env.example`. Default admin API key: `dev-admin-key`.

## Docker Compose

```bash
cd infrastructure
cp .env.example .env
docker compose up --build
```

Caddy will expose everything on `http://localhost` with `/api/*` routed to FastAPI.
