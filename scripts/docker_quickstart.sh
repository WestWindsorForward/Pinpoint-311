#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${REPO_URL:-"https://github.com/WestWindsorForward/CURSOR-311Temp.git"}
REPO_BRANCH=${REPO_BRANCH:-"main"}
INSTALL_DIR=${INSTALL_DIR:-"/opt/township"}
PUBLIC_URL_DEFAULT=${PUBLIC_URL_DEFAULT:-"http://localhost"}

log() {
  echo -e "\033[1;34m[township]\033[0m $*"
}

error() {
  echo -e "\033[1;31m[township]\033[0m $*" >&2
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    error "Please run this script as root (or via sudo)."
    exit 1
  fi
}

ensure_command() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    return 1
  fi
}

apt_package_for() {
  case "$1" in
    docker) echo "docker.io" ;;
    docker-compose) echo "docker-compose" ;;
    docker-compose-plugin) echo "docker-compose-plugin" ;;
    *) echo "$1" ;;
  esac
}

install_prereqs() {
  local packages=()
  for pkg in "$@"; do
    packages+=("$(apt_package_for "$pkg")")
  done
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing required packages: ${packages[*]}"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
  else
    error "Unable to install packages automatically (apt-get not found). Please install: ${packages[*]}"
    exit 1
  fi
}

ensure_prereqs() {
  local missing=()
  for cmd in curl git docker; do
    if ! ensure_command "$cmd"; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    install_prereqs "${missing[@]}"
  fi

  if ! command -v docker compose >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    install_prereqs docker-compose-plugin
  fi
}

clone_or_update_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Updating existing repository in $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
    git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
  else
    log "Cloning Township repository into $INSTALL_DIR"
    git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

prompt() {
  local text=$1
  local default=${2:-}
  local value
  if [[ -n "$default" ]]; then
    read -rp "$text [$default]: " value
    value=${value:-$default}
  else
    while true; do
      read -rp "$text: " value
      if [[ -n "$value" ]]; then
        break
      fi
      echo "Value is required."
    done
  fi
  echo "$value"
}

prompt_password() {
  local password confirm
  while true; do
    read -srp "Admin password: " password
    echo
    read -srp "Confirm password: " confirm
    echo
    if [[ "$password" != "$confirm" ]]; then
      echo "Passwords do not match. Try again."
      continue
    fi
    if (( ${#password} < 8 )); then
      echo "Password must be at least 8 characters."
      continue
    fi
    break
  done
  ADMIN_PASSWORD="$password"
}

run_setup() {
  local admin_email=$1
  local admin_password=$2
  local admin_name=$3
  local app_domain=$4
  local public_url=$5

  pushd "$INSTALL_DIR" >/dev/null
  log "Running Township bootstrapper..."
  ./scripts/setup_township.sh \
    --install-deps \
    --admin-email "$admin_email" \
    --admin-password "$admin_password" \
    --admin-name "$admin_name" \
    --domain "$app_domain" \
    --public-url "$public_url"
  popd >/dev/null
}

main() {
  require_root
  ensure_prereqs
  clone_or_update_repo

  log "Collecting configuration..."
  ADMIN_EMAIL=$(prompt "Admin email")
  ADMIN_NAME=$(prompt "Admin display name" "Township Administrator")
  prompt_password
  APP_DOMAIN=$(prompt "Hostname / APP_DOMAIN" ":80")
  local default_url=$PUBLIC_URL_DEFAULT
  if [[ "$APP_DOMAIN" != ":80" ]]; then
    default_url="http://${APP_DOMAIN}"
  fi
  PUBLIC_URL=$(prompt "Public URL" "$default_url")

  run_setup "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_NAME" "$APP_DOMAIN" "$PUBLIC_URL"

  log "Setup complete. Sign in at ${PUBLIC_URL}/login with ${ADMIN_EMAIL}."
}

main "$@"
