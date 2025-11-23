#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BACKEND_ENV="$PROJECT_ROOT/backend/.env"
INFRA_ENV="$PROJECT_ROOT/infrastructure/.env"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_NAME="Township Admin"
APP_DOMAIN=":80"
PUBLIC_URL="http://localhost"
SKIP_ADMIN=false
RESET_STACK=false
INSTALL_DEPS=false

usage() {
  cat <<'EOF'
Usage: ./scripts/setup_township.sh --admin-email you@town.gov --admin-password 'StrongPass123!' [options]

Required:
  --admin-email EMAIL         Email for the initial admin account
  --admin-password PASSWORD   Password for the initial admin account

Optional:
  --admin-name FULL_NAME      Display name for the initial admin (default "Township Admin")
  --domain APP_DOMAIN         Hostname (and optional port) for Caddy APP_DOMAIN (default :80)
  --public-url URL            Public URL to show in the summary (default http://localhost)
  --skip-admin                Skip creating/verifying the admin account
  --reset                     Stop the running stack before rebuilding (docker compose down)
  --install-deps              Install apt packages (docker.io, docker-compose-plugin, python3, jq, curl, openssl)
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
    --admin-name)
      ADMIN_NAME=$2
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
    --reset)
      RESET_STACK=true
      shift
      ;;
    --install-deps)
      INSTALL_DEPS=true
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
    echo "Error: --admin-email and --admin-password are required unless --skip-admin is set."
    usage
    exit 1
  fi
fi

APT_PACKAGES=(docker.io docker-compose-plugin python3 jq curl openssl)

require_cmd() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

maybe_install_deps() {
  if [[ "$INSTALL_DEPS" = true ]]; then
    if ! command -v sudo >/dev/null 2>&1; then
      echo "--install-deps requested but sudo is not available."
      exit 1
    fi
    echo "Installing required apt packages..."
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${APT_PACKAGES[@]}"
  fi
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE=(docker-compose)
  else
    echo "Docker Compose (plugin or v1) is required."
    exit 1
  fi
}

set_env_var() {
  local file=$1
  local key=$2
  local value=$3
  python3 - "$file" "$key" "$value" <<'PY'
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

get_env_var() {
  local file=$1
  local key=$2
  python3 - "$file" "$key" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
for line in path.read_text().splitlines():
    if line.startswith(f"{key}="):
        print(line.split("=", 1)[1])
        break
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

wait_for_endpoint() {
  local url=$1
  shift
  local expected_codes=("$@")
  local retries=30
  echo "Checking $url ..."
  for ((i=1; i<=retries; i++)); do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
    for allowed in "${expected_codes[@]}"; do
      if [[ "$code" == "$allowed" ]]; then
        echo "✔ $url responded with $code"
        return 0
      fi
    done
    sleep 2
  done
  echo "Endpoint $url did not respond with expected codes (${expected_codes[*]})."
  exit 1
}

login_admin_user() {
  local email=$1
  local password=$2
  local response status
  response=$(curl -sS -w "\n%{http_code}" -X POST \
    -F "username=${email}" \
    -F "password=${password}" \
    http://localhost:8000/api/auth/login || true)
  status=$(echo "$response" | tail -n1)
  if [[ "$status" == "200" ]]; then
    echo "Admin credentials verified via /api/auth/login."
    return 0
  fi
  echo "Existing admin account could not be logged into automatically (HTTP $status)."
  echo "You may need to reset the password manually via the database."
  exit 1
}

create_or_verify_admin() {
  local email=$1
  local password=$2
  local name=$3
  local payload response status body admin_key
  payload=$(jq -cn --arg email "$email" --arg password "$password" --arg display "$name" \
    '{email:$email,password:$password,display_name:$display}')

  admin_key=$(get_env_var "$BACKEND_ENV" "ADMIN_API_KEY")
  admin_key=${admin_key:-"dev-admin-key"}
  response=$(curl -sS -w "\n%{http_code}" -H "Content-Type: application/json" \
    -H "X-Admin-Key: $admin_key" -d "$payload" \
    http://localhost:8000/api/auth/bootstrap-admin || true)
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [[ "$status" == "200" ]]; then
    echo "Admin user bootstrapped."
    return 0
  fi

  echo "Bootstrap endpoint responded with HTTP $status; falling back to /api/auth/register..."
  response=$(curl -sS -w "\n%{http_code}" -H "Content-Type: application/json" -d "$payload" \
    http://localhost:8000/api/auth/register || true)
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [[ "$status" == "201" ]]; then
    echo "Admin user created."
    return 0
  fi

  if [[ "$status" == "400" && "$body" == *"Email already registered"* ]]; then
    echo "Admin already exists. Verifying credentials..."
    login_admin_user "$email" "$password"
    return 0
  fi

  echo "Failed to create admin user (HTTP $status): $body"
  exit 1
}

maybe_install_deps

require_cmd openssl
require_cmd curl
require_cmd python3
ensure_compose

if [[ "$SKIP_ADMIN" = false ]]; then
  require_cmd jq
fi

ensure_backend_env
ensure_infrastructure_env

if [[ "$RESET_STACK" = true ]]; then
  echo "Resetting existing Docker stack..."
  (cd "$PROJECT_ROOT/infrastructure" && "${DOCKER_COMPOSE[@]}" down)
fi

echo "Bringing up the Docker stack..."
(cd "$PROJECT_ROOT/infrastructure" && "${DOCKER_COMPOSE[@]}" up -d --build)

echo "Running database migrations..."
"$PROJECT_ROOT/scripts/run_migrations.sh"

wait_for_endpoint "http://localhost:8000/health" 200
wait_for_endpoint "http://localhost:8000/api/auth/register" 405
wait_for_endpoint "http://localhost/api/auth/register" 405

if [[ "$SKIP_ADMIN" = false ]]; then
  create_or_verify_admin "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME"
fi

cat <<EOF

✅ Township stack is running.
   Public URL: ${PUBLIC_URL}
   Admin Email: ${ADMIN_EMAIL:-"(skipped)"}

Next steps:
  • Visit ${PUBLIC_URL}/login to sign in.
  • Use the admin console to upload branding, categories, and secrets.
  • For troubleshooting, run ./scripts/township_diagnostics.sh

Residents do not need to log in to submit requests; email/phone is optional for status updates.

To view backend logs, run: (cd infrastructure && ${DOCKER_COMPOSE[*]} logs -f backend)
EOF
