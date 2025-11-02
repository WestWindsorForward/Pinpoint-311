#!/usr/bin/env bash
set -euo pipefail

cd /app

if [[ "${1:-server}" == "server" ]]; then
  echo "[ENTRYPOINT] Running database migrations"
  alembic upgrade head

  echo "[ENTRYPOINT] Seeding baseline data"
  python -m app.prestart

  echo "[ENTRYPOINT] Starting API server"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
else
  exec "$@"
fi
