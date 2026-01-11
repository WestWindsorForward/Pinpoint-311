# Government Compliance & Security Posture

The Township 311 platform is designed for on-premises deployment within municipal jurisdictions, prioritizing data sovereignty, administrative accountability, and regulatory compliance.

---

## 1. Government-Ready Core Features

### Data Sovereignty
- **On-Premises Deployment**: Containerized via Docker for deployment behind municipal firewalls or private government clouds
- **Total PII Control**: All citizen data remains within the township's infrastructure
- **No Third-Party Data Sharing**: No external analytics or tracking services

### Audit Logging
- **Comprehensive Trail**: Every lifecycle event recorded in `request_audit_logs` table
- **Actions Tracked**: Submission, assignment, status changes, comments, edits
- **Immutable Ledger**: Write-only audit design for legal discovery and institutional memory

### Role-Based Access Control (RBAC)

| Role | Access Level |
|------|--------------|
| **Resident** | Public submission, track own requests (ID required), no PII visibility |
| **Staff** | Department-scoped or global request management, internal comments |
| **Admin** | System-wide control: users, departments, branding, API keys |

### Open311 Compliance
- **GeoReport v2**: Standard-compliant API for interoperability
- **Service Discovery**: XML/JSON endpoint at `/api/services/`
- **Third-Party Integration**: Compatible with Open311 reporter apps

---

## 2. Security Posture

### Authentication & Authorization

| Feature | Implementation |
|---------|----------------|
| Password Storage | bcrypt one-way hashing |
| Session Management | JWT tokens with configurable expiration |
| Endpoint Security | FastAPI role-based dependency injection |
| Login Protection | Per-user authentication with salted hashes |

### Infrastructure Security

| Layer | Protection |
|-------|------------|
| Transport | Automatic HTTPS via Caddy (Let's Encrypt) |
| API Secrets | Environment isolation, never in version control |
| Database | PostgreSQL in private Docker network |
| CORS | Configured for API protection |

### Input Validation
- Pydantic schema validation on all API inputs
- SQL injection protection via SQLAlchemy ORM
- XSS prevention through React's built-in escaping

---

## 3. Known Gaps & Vulnerabilities

| Area | Current State | Risk | Remediation |
|------|---------------|------|-------------|
| **MFA** | Single-factor only | Moderate | Integrate TOTP or SSO (OIDC/SAML) for staff |
| **Rate Limiting** | Infrastructure-level only | Low | Add per-IP/per-user app-level limits on `/requests` |
| **Encryption at Rest** | Host OS dependent | Low | Enable LUKS or EBS-level encryption for DB volume |
| **Audit Retention** | Permanent (no purge) | Low | Implement configurable archival policy |
| **PII in Comments** | Text input only | Moderate | Add AI/regex PII scanning for public fields |

---

## 4. Remediation Strategies

### Priority 1: Multi-Factor Authentication (High Impact)
1. Implement TOTP library integration (e.g., `pyotp`)
2. Add MFA enrollment flow in Admin Console
3. Enforce MFA for admin role, optional for staff

### Priority 2: Rate Limiting (Medium Impact)
1. Add `slowapi` middleware to FastAPI
2. Configure limits: 100/min for public, 1000/min for authenticated
3. Return 429 with retry-after header

### Priority 3: PII Scanning (Medium Impact)
1. Integrate regex patterns for email, phone, SSN detection
2. Flag comments containing PII for staff review
3. Optional: Use Vertex AI for advanced PII detection

### Priority 4: Audit Retention Policy (Low Impact)
1. Add `AUDIT_RETENTION_DAYS` system setting
2. Create nightly Celery task for archival
3. Export to compressed JSON before deletion

---

## 5. Compliance Checklist

### Municipal IT Requirements
- [ ] Passed security assessment
- [ ] Data retention policy documented
- [ ] Incident response plan established
- [ ] Staff training completed

### Technical Verification
- [x] HTTPS enforced in production
- [x] Audit logging enabled
- [x] Password hashing verified (bcrypt)
- [x] Role separation implemented
- [ ] Penetration testing completed
- [ ] Backup/restore procedure tested

---

## 6. Accessibility Compliance (WCAG 2.2 AA)

The platform implements comprehensive accessibility features to meet **WCAG 2.2 Level AA** and **Section 508** standards.

### Verified Standards

| WCAG Criterion | Status | Implementation |
|----------------|--------|----------------|
| **4.1.2 Name, Role, Value** | ✅ | All buttons, inputs, and toggles have proper aria-labels |
| **1.4.3 Contrast (Minimum)** | ✅ | Text meets 4.5:1 contrast ratio on all backgrounds |
| **2.1.1 Keyboard** | ✅ | All interactive elements keyboard-accessible |
| **2.4.4 Link Purpose** | ✅ | Links have descriptive text or aria-labels |
| **4.1.1 Parsing** | ✅ | Valid HTML/ARIA with matching id references |

### Implementation Details

**Interactive Elements:**
- Toggle switches implement `role="switch"`, `aria-checked`, and `aria-label`
- Icon-only buttons have `aria-label` with icons marked `aria-hidden="true"`
- All form inputs have visible labels or programmatic `aria-label` attributes

**Text & Color:**
- Low-contrast colors systematically upgraded (e.g., gray-500→gray-600, yellow-600→amber-700)
- Text on dark backgrounds uses high-contrast variants (e.g., *-200 instead of *-400)

**Keyboard Navigation:**
- All clickable cards support Enter/Space key activation
- Scrollable regions have `tabindex="0"` for keyboard access
- Filter checkboxes respond to Enter key via global handler

### Accessibility Checklist
- [x] All buttons have discernible text (aria-label or visible text)
- [x] All form elements have labels
- [x] Color contrast meets WCAG AA requirements
- [x] Scrollable regions have keyboard access
- [x] ARIA attributes have valid values
- [x] aria-controls references have matching ids
- [ ] Screen reader testing completed
- [ ] Automated accessibility audit passed (axe-core)

---

## 7. Contact & Resources

- **Repository**: [GitHub](https://github.com/WestWindsorForward/WWF-Open-Source-311-Template)
- **API Documentation**: `/api/docs` (Swagger UI)
- **Security Issues**: Report privately via GitHub Security Advisories

---

*Document Version: 1.0 | Last Updated: January 2026*
