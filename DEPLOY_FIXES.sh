#!/bin/bash

# Deploy critical fixes to your server

set -e

echo "================================================="
echo "DEPLOYING CRITICAL FIXES"
echo "================================================="
echo ""

cd ~/township 2>/dev/null || cd /workspace 2>/dev/null || { echo "Cannot find township directory"; exit 1; }

echo "Step 1: Pull latest code..."
git pull

echo ""
echo "Step 2: Rebuild and restart backend..."
cd infrastructure
docker compose up -d --build backend

echo ""
echo "Step 3: Waiting for backend to start (15 seconds)..."
sleep 15

echo ""
echo "Step 4: Testing database connection..."
docker compose exec -T db pg_isready -U postgres || { echo "Database not ready"; exit 1; }

echo ""
echo "================================================="
echo "✅ FIXES DEPLOYED"
echo "================================================="
echo ""
echo "🧪 Now test your admin portal:"
echo "   1. Save branding"
echo "   2. Save runtime config (Google Maps API key)"
echo "   3. Try the Update Now button"
echo ""
echo "📊 Watch logs in real-time:"
echo "   docker compose logs backend -f"
echo ""
echo "🔍 You should see:"
echo "   [BRANDING] Updating branding: {...}"
echo "   [BRANDING] ✅ VERIFIED - Data in database: {...}"
echo "   [RUNTIME] Updating runtime config: {...}"
echo "   [RUNTIME] ✅ VERIFIED - Config in database: {...}"
echo ""
echo "📝 Verify data in database:"
echo "   docker compose exec -T db psql -U postgres -d township -c \"SELECT key, value FROM township_settings;\""
echo ""
echo "================================================="
