#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BACKEND_ENV="$PROJECT_ROOT/backend/.env"
INFRA_ENV="$PROJECT_ROOT/infrastructure/.env"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
APP_DOMAIN=":80"
PUBLIC_URL=""
SKIP_ADMIN=false

usage() {
  cat <<'EOF'
Usage: ./scripts/setup_township.sh --admin-email you@town.gov --admin-password 'StrongPass123!' [options]

Required:
  --admin-email EMAIL         Email for the initial admin account
  --admin-password PASSWORD   Password for the initial admin account

Optional:
  --domain APP_DOMAIN         Hostname (and optional port) for Caddy APP_DOMAIN (default :80)
  --public-url URL            Public URL to show in the summary (default http://localhost)
  --skip-admin                Skip creating the admin account (useful for repeat runs)
  -h, --help                  Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-email)
      ADMIN_EMAIL=$2
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD=$2
      shift 2
      ;;
    --domain)
      APP_DOMAIN=$2
      shift 2
      ;;
    --public-url)
      PUBLIC_URL=$2
      shift 2
      ;;
    --skip-admin)
      SKIP_ADMIN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$SKIP_ADMIN" = false ]]; then
  if [[ -z "${ADMIN_EMAIL}" || -z "${ADMIN_PASSWORD}" ]]; then
    echo "Error: --admin-email and --admin-password are required unless --skip-admin is used."
    usage
    exit 1
  fi
fi

if [[ -z "${PUBLIC_URL}" ]]; then
  PUBLIC_URL="http://localhost"
fi

require_cmd() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

require_cmd openssl
require_cmd curl
require_cmd python3

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  echo "Docker Compose (plugin or v1) is required."
  exit 1
fi

set_env_var() {
  local file=$1
  local key=$2
  local value=$3
  "${PYTHON_BIN:-python3}" - "$file" "$key" "$value" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text().splitlines()
updated = False
for idx, line in enumerate(lines):
    if line.startswith(f"{key}="):
        lines[idx] = f"{key}={value}"
        updated = True
        break
if not updated:
    lines.append(f"{key}={value}")
path.write_text("\n".join(lines) + "\n")
PY
}

ensure_backend_env() {
  if [[ ! -f "$BACKEND_ENV" ]]; then
    cp "$PROJECT_ROOT/backend/.env.example" "$BACKEND_ENV"
  fi
  if grep -q "^JWT_SECRET_KEY=change-me" "$BACKEND_ENV"; then
    set_env_var "$BACKEND_ENV" "JWT_SECRET_KEY" "$(openssl rand -hex 32)"
  fi
  if grep -q "^ADMIN_API_KEY=dev-admin-key" "$BACKEND_ENV"; then
    set_env_var "$BACKEND_ENV" "ADMIN_API_KEY" "$(openssl rand -hex 16)"
  fi
}

ensure_infrastructure_env() {
  if [[ ! -f "$INFRA_ENV" ]]; then
    cp "$PROJECT_ROOT/infrastructure/.env.example" "$INFRA_ENV"
  fi
  set_env_var "$INFRA_ENV" "APP_DOMAIN" "$APP_DOMAIN"
}

wait_for_backend() {
  local retries=30
  local url=${1:-http://localhost:8000/health}
  echo "Waiting for backend to become healthy..."
  for ((i=1; i<=retries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "Backend is healthy."
      return 0
    fi
    sleep 2
  done
  echo "Backend did not become healthy after $((retries*2)) seconds."
  exit 1
}

create_admin_user() {
  local email=$1
  local password=$2
  local payload
  payload=$(jq -cn --arg email "$email" --arg password "$password" --arg display "Township Admin" '{email:$email,password:$password,display_name:$display}')
  local response status
  response=$(curl -sS -w "\n%{http_code}" -H "Content-Type: application/json" -d "$payload" http://localhost:8000/api/auth/register || true)
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  if [[ "$status" == "201" ]]; then
    echo "Admin user created."
  elif [[ "$status" == "400" && "$body" == *"Email already registered"* ]]; then
    echo "Admin user already exists; skipping creation."
  else
    echo "Failed to create admin user (HTTP $status): $body"
    exit 1
  fi
}

ensure_backend_env
ensure_infrastructure_env

echo "Bringing up the Docker stack..."
(cd "$PROJECT_ROOT/infrastructure" && "${DOCKER_COMPOSE[@]}" up -d --build)

echo "Running database migrations..."
"$PROJECT_ROOT/scripts/run_migrations.sh"

wait_for_backend

if [[ "$SKIP_ADMIN" = false ]]; then
  require_cmd jq
  create_admin_user "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
fi

cat <<EOF

✅ Township stack is running.
   URL: ${PUBLIC_URL}
   Admin Email: ${ADMIN_EMAIL:-"(skipped)"} 

Next steps:
  • Visit ${PUBLIC_URL}/login to sign in.
  • Use the admin console to upload branding, categories, and secrets.

To view logs, run: (cd infrastructure && ${DOCKER_COMPOSE[*]} logs -f backend)
EOF
