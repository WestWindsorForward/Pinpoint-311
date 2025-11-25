#!/bin/bash

# Quick fix script for Cloudflare SSL Error 525
# This script helps diagnose and fix SSL handshake issues

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infrastructure"

echo "================================================="
echo "Cloudflare SSL Error 525 Fix Script"
echo "================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "$INFRA_DIR/docker-compose.yml" ]; then
    echo "ERROR: Cannot find docker-compose.yml"
    exit 1
fi

cd "$INFRA_DIR"

echo "Step 1: Checking container status..."
docker compose ps

echo ""
echo "Step 2: Checking Caddy logs for SSL errors..."
docker compose logs caddy --tail=20

echo ""
echo "================================================="
echo "SOLUTION OPTIONS:"
echo "================================================="
echo ""
echo "Option A: Change Cloudflare SSL Mode (RECOMMENDED)"
echo "  1. Go to: https://dash.cloudflare.com"
echo "  2. Select your domain"
echo "  3. Go to SSL/TLS > Overview"
echo "  4. Change from 'Full (strict)' to 'Full'"
echo "  5. Wait 1-2 minutes"
echo ""
echo "Option B: Restart Caddy to regenerate certificates"
echo "  Run: docker compose restart caddy"
echo ""
echo "Option C: Rebuild all services with new volumes"
echo "  Run: docker compose up -d --force-recreate caddy"
echo ""
echo "================================================="
echo ""

read -p "Would you like to restart Caddy now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restarting Caddy..."
    docker compose restart caddy
    echo "Caddy restarted. Wait 30 seconds and try accessing your site."
    sleep 5
    echo "Checking Caddy logs after restart..."
    docker compose logs caddy --tail=30
fi

echo ""
echo "If the issue persists, change Cloudflare SSL mode to 'Full' (not strict)."
