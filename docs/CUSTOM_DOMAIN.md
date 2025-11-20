# Connecting a Custom Domain

Follow these steps to put the Township Request Management System behind your own hostname (e.g., `311.yourtown.gov`).

## 1. DNS
- Create an **A record** (or AAAA for IPv6) pointing your desired hostname to the public IP of the server running Docker Compose.
- Example: `311.yourtown.gov -> 203.0.113.42`.
- Propagation can take a few minutes; use `dig`/`nslookup` to verify.

## 2. Configure Compose Environment
In `infrastructure/.env` set:

```
APP_DOMAIN=311.yourtown.gov
TLS_EMAIL=ops@yourtown.gov  # optional but recommended for Let's Encrypt notifications
```

- Leaving `APP_DOMAIN=:80` keeps the default HTTP-only localhost behavior.
- Any time you change these values, re-run `docker compose up -d` to reload Caddy.

## 3. Expose Ports 80/443
Ensure the host firewall allows inbound TCP 80 and 443 to the machine. The Compose file already publishes these ports from the `caddy` service.

## 4. Restart the Stack
```
cd infrastructure
docker compose down
docker compose up --build -d
```

Caddy will detect `APP_DOMAIN`, request a TLS certificate via Let's Encrypt, and terminate HTTPS in front of the backend/frontend services. Logs appear via `docker compose logs -f caddy` if you need to troubleshoot.

## 5. Advanced Tweaks
- Wildcard certificates: integrate an ACME DNS challenge module if needed (Caddy supports this via plugins).
- Multiple domains: set `APP_DOMAIN` to a comma-separated list (e.g., `311.yourtown.gov,api.yourtown.gov`).
- Air-gapped deployments: provision certificates manually and mount them into `/data/caddy/`.
