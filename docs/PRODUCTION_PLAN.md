# Production Hardening Plan

## 1. Authentication & Authorization
- Replace admin API key with OAuth2/JWT-based auth (staff + resident accounts).
- Support SSO/SAML and optional MFA for staff.
- Role-based access control: resident, staff (per department), admin, super-admin.
- Session management: refresh tokens, inactivity timeout, device tracking.
- Password policies + secure recovery flow.

## 2. Security & Compliance
- Secrets management via HashiCorp Vault or AWS/GCP Secret Manager.
- TLS everywhere (Caddy/Ingress + backend service-to-service). Consider mTLS inside cluster.
- Rate limiting + bot protection on resident endpoints (FastAPI middleware / Caddy modules).
- Attachment virus scanning (ClamAV microservice) and image moderation.
- Encrypt file storage (S3/MinIO with SSE). Provide configurable retention + purge tooling.
- Audit logging for all admin/staff actions (append-only logs with tamper detection).
- Boundary/PII compliance: redact personal data in logs, add data retention policies + export tooling.
- Security headers (CSP/Strict-Transport-Security) via Caddy config.
- Third-party integration secrets rotation + event logging.

## 3. Observability & Operations
- Structured JSON logging with correlation IDs across FastAPI, Celery, frontend edge.
- Metrics: Prometheus exporters (FastAPI/Starlette, Celery, Postgres) + Grafana dashboards.
- Tracing: OpenTelemetry instrumentation + collector (OTLP -> Tempo/Jaeger).
- Alerting: health checks, queue depth, latency, error budget burn rates hooked to PagerDuty/Email.
- Log pipeline to Elasticsearch/Loki with retention + audit search.
- Runbooks for major incidents, data restore, scaling workflows.

## 4. Infrastructure & Deployments
- GitHub Actions (or preferred CI) for lint/test/build, Docker image push, SBOM, vulnerability scans.
- Automated DB migrations (Alembic) baked into deploy pipeline.
- Production topology: HA Postgres (Patroni or managed), Redis Sentinel, redundant app pods.
- Container orchestration: Kubernetes manifests/Helm chart (or Scale HC3 VM autoscaling) with readiness/liveness probes.
- Persistent storage backups + disaster recovery drills (daily snapshots, weekly offsite copy).
- Config management per environment (dev/stage/prod) via Helm values or env-specific compose.
- CDN/caching for frontend + uploaded assets.
- Penetration testing + dependency monitoring (Dependabot/Renovate).

## 5. Testing & Quality Gates
- Unit/integration test coverage for API, workers, frontend (Vitest/Cypress).
- End-to-end synthetic tests against staging (Playwright) with mocked providers.
- Load/performance testing suite (k6/Locust) capturing SLAs.
- Security scanning (Snyk/Trivy) in CI.
- Regression suite before releases + blue/green deploy strategy.

## 6. Governance & Documentation
- Architecture decision records, change management workflow.
- Data classification matrix + access reviews.
- Onboarding docs for municipalities (branding, secrets, GIS upload process).
- Maintenance calendar for key rotations, dependency updates.
