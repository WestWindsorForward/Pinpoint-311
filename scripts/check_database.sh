#!/bin/bash

# Check what's actually stored in the database

echo "================================================="
echo "DATABASE CONFIGURATION CHECK"
echo "================================================="
echo ""

cd ~/township/infrastructure 2>/dev/null || cd /workspace/infrastructure

echo "Checking Runtime Config in Database..."
docker compose exec -T db psql -U postgres -d township -c "SELECT key, value FROM township_settings WHERE key = 'runtime_config';" 2>/dev/null || echo "Could not connect to database"

echo ""
echo "Checking Branding in Database..."
docker compose exec -T db psql -U postgres -d township -c "SELECT key, value FROM township_settings WHERE key = 'branding';" 2>/dev/null || echo "Could not connect to database"

echo ""
echo "Checking All Settings..."
docker compose exec -T db psql -U postgres -d township -c "SELECT key, value FROM township_settings;" 2>/dev/null || echo "Could not connect to database"

echo ""
echo "================================================="
