#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
INFRA_DIR="$PROJECT_ROOT/infrastructure"

section() {
  echo
  echo "== $1 =="
}

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  echo "Docker Compose is required to run diagnostics."
  exit 1
fi

section "Docker Compose Services"
(cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" ps)

section "Backend Health"
if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
  echo "FastAPI health endpoint reachable on port 8000."
else
  echo "Failed to reach FastAPI health endpoint on port 8000." >&2
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost/api/auth/register 2>/dev/null | grep -qE "405|200"; then
  echo "Caddy is proxying /api/* correctly."
else
  echo "Caddy proxy check failed (http://localhost/api/auth/register)." >&2
fi

section "Database Connectivity"
if (cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" exec -T db pg_isready -U postgres -d township >/dev/null 2>&1); then
  echo "PostgreSQL responded to pg_isready."
else
  echo "pg_isready failed. Check db container logs." >&2
fi

section "Running Alembic Heads"
if (cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" exec -T backend alembic current >/tmp/alembic.out 2>/tmp/alembic.err); then
  cat /tmp/alembic.out
else
  echo "Failed to fetch Alembic state:"
  cat /tmp/alembic.err
fi

section "Recent Backend Logs"
(cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" logs --tail=80 backend)

section "Recent Caddy Logs"
(cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" logs --tail=40 caddy)

section "Celery Worker Snapshot"
(cd "$INFRA_DIR" && "${DOCKER_COMPOSE[@]}" ps celery-worker celery-beat)

echo
echo "Diagnostics complete."
