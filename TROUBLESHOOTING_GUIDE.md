# Troubleshooting Guide - Configuration Not Saving

## Issue: Google Maps API Key / Branding Not Saving

### Step 1: Check if Data is in Database

Run this on your server:

```bash
cd ~/township/infrastructure

# Check what's actually stored
docker compose exec -T db psql -U postgres -d township -c "SELECT key, value FROM township_settings WHERE key IN ('runtime_config', 'branding');"
```

### Step 2: Check Backend Logs for Errors

```bash
# Watch for errors when you try to save
docker compose logs backend -f
```

Keep this running, then try to save settings in the admin panel and watch for errors.

### Step 3: Test API Directly

```bash
# Test if backend is receiving requests
docker compose logs backend --tail=100 | grep -E "(PUT|POST|branding|runtime)"
```

### Step 4: Clear Browser Cache

Sometimes the frontend caches old data:

1. Open browser DevTools (F12)
2. Go to Application tab
3. Clear Storage → Clear site data
4. Refresh the page (Ctrl+Shift+R)

### Step 5: Check Network Tab

1. Open DevTools (F12) → Network tab
2. Try saving settings
3. Look for:
   - Failed requests (red)
   - 401/403 errors (permission issues)
   - 500 errors (backend crashes)

---

## Immediate Fix Commands

### Fix 1: Manually Set Google Maps API Key

```bash
cd ~/township/infrastructure

# Replace YOUR_API_KEY with your actual key
docker compose exec -T db psql -U postgres -d township <<EOF
INSERT INTO township_settings (key, value, created_at, updated_at)
VALUES (
  'runtime_config',
  '{"google_maps_api_key": "YOUR_API_KEY_HERE"}',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  COALESCE(township_settings.value, '{}'::jsonb),
  '{google_maps_api_key}',
  '"YOUR_API_KEY_HERE"'::jsonb
),
updated_at = NOW();
EOF
```

### Fix 2: Manually Set Branding

```bash
docker compose exec -T db psql -U postgres -d township <<EOF
INSERT INTO township_settings (key, value, created_at, updated_at)
VALUES (
  'branding',
  '{
    "town_name": "West Windsor",
    "site_title": "311 Service Requests",
    "hero_text": "Report issues and track requests",
    "primary_color": "#0f172a",
    "secondary_color": "#38bdf8"
  }',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
EOF
```

### Fix 3: Restart Backend to Reload Config

```bash
cd ~/township/infrastructure
docker compose restart backend
sleep 5
docker compose logs backend --tail=20
```

---

## Common Issues

### Issue: "Not Authorized" / 401 Error

**Solution:** You're not logged in as admin

```bash
# Check your role in the database
docker compose exec -T db psql -U postgres -d township -c "SELECT email, role FROM users WHERE role = 'admin';"
```

### Issue: Backend Not Responding

**Solution:** Check if backend is healthy

```bash
curl http://localhost:8000/api/health
```

Should return: `{"status":"healthy"}` or similar

### Issue: Database Connection Failed

**Solution:** Restart database

```bash
docker compose restart db
sleep 10
docker compose restart backend
```

---

## Verify Fix Worked

After applying fixes:

```bash
# 1. Check database has the data
docker compose exec -T db psql -U postgres -d township -c "SELECT key, value FROM township_settings;"

# 2. Restart backend
docker compose restart backend

# 3. Test API endpoint
curl http://localhost:8000/api/resident/config | jq '.integrations.google_maps_api_key'

# Should show your API key
```

---

## Still Not Working?

### Enable Debug Logging

Add to `backend/.env` or docker-compose environment:

```bash
LOG_LEVEL=DEBUG
```

Then restart:

```bash
docker compose restart backend
docker compose logs backend -f
```

### Check for CORS Issues

If saving from a different domain:

```bash
# Check backend logs for CORS errors
docker compose logs backend | grep -i cors
```

---

## Get Help

If still not working, collect this info:

```bash
# 1. Container status
docker compose ps

# 2. Backend logs
docker compose logs backend --tail=100 > backend_logs.txt

# 3. Database contents
docker compose exec -T db psql -U postgres -d township -c "SELECT * FROM township_settings;" > db_settings.txt

# 4. Network test
curl -v http://localhost:8000/api/resident/config > api_test.txt 2>&1
```

Share these files for debugging.
