# Cloudflare SSL Error 525 - Quick Fix Guide

## What Happened?
Error 525 means Cloudflare cannot establish an SSL connection with your origin server. This commonly occurs when:
- The server restarted and SSL certificates need to be regenerated
- Cloudflare SSL/TLS mode doesn't match your origin configuration

## Quick Fix: Change Cloudflare SSL Mode

### Option 1: Use "Full" Mode (Recommended for Cloudflare)

1. **Log into Cloudflare Dashboard**
   - Go to: https://dash.cloudflare.com
   - Select your domain: `westwindsorforward.org`

2. **Navigate to SSL/TLS Settings**
   - Click on **SSL/TLS** in the left sidebar
   - Click on **Overview** tab

3. **Change SSL/TLS Encryption Mode**
   - Change from **"Full (strict)"** to **"Full"**
   - This allows Cloudflare to accept self-signed certificates from your origin

4. **Wait 1-2 minutes** for the change to propagate

### Option 2: Use "Flexible" Mode (Easier but less secure)

Same steps as above, but select **"Flexible"** mode instead.
- This makes Cloudflare handle all SSL, with plain HTTP to your origin
- Less secure but works immediately

---

## Alternative: Fix Origin SSL Configuration

If you prefer to keep "Full (strict)" mode, ensure your server has a valid SSL certificate.

### Check if Caddy is running:
```bash
cd /workspace/infrastructure
docker compose ps caddy
```

### View Caddy logs:
```bash
docker compose logs caddy --tail=100
```

### Restart Caddy to regenerate certificates:
```bash
docker compose restart caddy
```

### Check certificate status:
```bash
docker compose exec caddy caddy list-certificates
```

---

## Environment Variables to Check

Ensure these are set in your `.env` file or environment:

```bash
APP_DOMAIN=311.westwindsorforward.org
TLS_EMAIL=your-email@westwindsorforward.org
```

### Update docker-compose.yml if needed:

The Caddy service should look like this:
```yaml
caddy:
  image: caddy:2.9
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  environment:
    APP_DOMAIN: ${APP_DOMAIN:-:80}
    TLS_EMAIL: ${TLS_EMAIL:-}
```

And add these volumes at the bottom:
```yaml
volumes:
  caddy_data:
  caddy_config:
```

---

## Testing

After making changes:

1. **Test direct server access** (bypassing Cloudflare):
   ```bash
   curl -I https://311.westwindsorforward.org
   ```

2. **Check Cloudflare Status**:
   - Should show "Active" with a green checkmark

3. **Try accessing the site** in your browser

---

## Most Likely Solution

**Change Cloudflare SSL mode from "Full (strict)" to "Full"**

This is the quickest fix and will work immediately with Caddy's automatic HTTPS.
