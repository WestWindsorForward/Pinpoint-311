#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is required to run this project." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose v2 is required. Please upgrade Docker." >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "[INFO] Creating .env.local from template"
  cp .env.example .env.local
  echo "[INFO] Please review .env.local before continuing."
fi

echo "[INFO] Validating township configuration"
python3 scripts/validate_config.py config/township.yaml

echo "[INFO] Building and starting containers"
docker compose --project-name township up -d --build

echo "[INFO] Waiting for backend health check"
ATTEMPTS=0
until docker compose --project-name township ps backend | grep -q "healthy"; do
  sleep 5
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 24 ]; then
    echo "[ERROR] Backend did not become healthy in time." >&2
    docker compose --project-name township logs backend
    exit 1
  fi
done

echo "[INFO] Backend is healthy. Initial administrator credentials (if newly created) will appear below:"
docker compose --project-name township logs --tail=50 backend | grep -i "Temporary admin"

echo "[SUCCESS] Deployment is complete. Access the resident portal at http://localhost and the staff portal at http://localhost/staff"
