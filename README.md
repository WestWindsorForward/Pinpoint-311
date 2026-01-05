# Township 311 System

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg" alt="React 18">
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791.svg" alt="PostgreSQL 15">
  <img src="https://img.shields.io/badge/Open311-v2-green.svg" alt="Open311 v2">
</p>

A white-label, open-source civic engagement platform for municipal request management (311 system). Features AI-powered triage, GIS integration, and a premium glassmorphism UI. Built for on-premises government deployment.

## ✨ Features

- **Open311 Compliant** - GeoReport v2 compatible API
- **Premium Glassmorphism UI** - Modern, responsive design
- **Mobile-First** - App-like experience on mobile devices
- **AI Triage** - Optional Vertex AI integration for request analysis
- **GIS Ready** - PostGIS for spatial queries and geocoding
- **White-Label** - Fully customizable branding
- **Self-Hosted** - Data sovereignty with on-premises deployment

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/WestWindsorForward/WWF-Open-Source-311-Template.git
   cd WWF-Open-Source-311-Template
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the services**
   ```bash
   docker-compose up -d
   ```

4. **Access the portals**
   - 🏠 **Resident Portal**: http://localhost/
   - 👷 **Staff Dashboard**: http://localhost/staff
   - ⚙️ **Admin Console**: http://localhost/admin
   - 📚 **API Docs**: http://localhost/api/docs

### Default Credentials

| Portal | Username | Password |
|--------|----------|----------|
| Staff/Admin | `admin` | `admin123` |

> ⚠️ **Change these in production!**

---

## 📱 User Roles

| Role | Capabilities |
|------|-------------|
| **Resident** | Submit requests (no login required) |
| **Staff** | View/update requests, manual intake, statistics |
| **Admin** | All staff permissions + user management, branding, settings |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Framer Motion |
| Backend | FastAPI, Python 3.11, SQLAlchemy Async |
| Database | PostgreSQL 15 + PostGIS |
| Queue | Celery + Redis |
| AI | Google Vertex AI (Gemini 3.0 Flash) |
| Proxy | Caddy (auto-SSL) |
| Container | Docker Compose |

---

## 🎯 Feature Deep-Dive

### Resident Portal
- **No Login Required**: Anonymous submission with email/SMS tracking
- **Photo Upload**: Multiple images with automatic compression
- **Location Picker**: Google Maps integration with address autocomplete
- **Request Tracking**: Track status via confirmation email or request ID

### AI-Powered Triage
- **Automatic Priority Scoring**: 1-10 scale based on severity, safety, and context
- **Photo Analysis**: Multimodal analysis of uploaded images
- **Historical Context**: Detects recurring issues at the same location
- **Safety Flags**: Identifies urgent hazards requiring immediate attention

### Staff Dashboard
- **Real-Time Updates**: Live feed of new and updated requests
- **Advanced Statistics**: PostGIS-powered analytics with heatmaps
- **Department Routing**: Automatic assignment based on service category
- **Audit Timeline**: Complete history of all actions on each request

### Notification System
- **Email Notifications**: Branded HTML emails for confirmations and updates
- **SMS Alerts**: Optional Twilio or HTTP-based SMS integration
- **Staff Alerts**: Per-user notification preferences (email/SMS)
- **Department Routing**: Automatic email to responsible department

### GIS Integration
- **PostGIS Analytics**: Hotspot detection, coverage analysis
- **Map Layers**: Upload custom GeoJSON layers (parcels, zones, assets)
- **Asset Matching**: Link requests to nearest infrastructure asset
- **Boundary Validation**: Verify addresses within township limits

### Setup Wizard
- **First-Run Configuration**: Guided 7-step setup for new installations
- **Branding Setup**: Township name, logo, and color customization
- **Department Creation**: Create routing departments with emails
- **Security**: Automatic prompt to change default password
- **Optional Integrations**: Google Maps and Vertex AI configuration

---

## 📁 Project Structure

```
township-311/
├── backend/
│   ├── app/
│   │   ├── api/          # API route handlers
│   │   ├── core/         # Auth, config, Celery
│   │   ├── db/           # Database session & init
│   │   ├── services/     # Business logic
│   │   ├── tasks/        # Background tasks
│   │   ├── main.py       # FastAPI app
│   │   ├── models.py     # SQLAlchemy models
│   │   └── schemas.py    # Pydantic schemas
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── context/      # React contexts
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   └── types/        # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── Caddyfile
├── COMPLIANCE.md         # Security & government compliance
└── .env.example
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOMAIN` | Your domain for SSL | `localhost` |
| `SECRET_KEY` | JWT signing key | (change me!) |
| `DB_PASSWORD` | Database password | `township` |
| `INITIAL_ADMIN_PASSWORD` | Default admin password | `admin123` |

### Admin Console Settings

Access `/admin` to configure:

| Section | Options |
|---------|---------|
| **Branding** | Municipality name, logo, primary color, hero text |
| **Users** | Staff and admin accounts with department assignments |
| **Services** | Request categories with icons and custom fields |
| **Departments** | Department routing emails and staff assignment |
| **API Keys** | Google Maps, Vertex AI, SMS providers |
| **Modules** | Enable/disable AI analysis, SMS alerts, email notifications |

### API Keys (via Admin Console)

| Key | Purpose | Required |
|-----|---------|----------|
| `GOOGLE_MAPS_API_KEY` | Address autocomplete, maps | Recommended |
| `VERTEX_AI_PROJECT` | AI triage and analysis | Optional |
| `SMTP_*` | Email notifications | Optional |
| `TWILIO_*` or `SMS_HTTP_*` | SMS notifications | Optional |

---

## 🔄 Updates

From the Admin Console, click "Pull Updates" to:
1. Fetch latest code from GitHub
2. Rebuild Docker containers
3. Restart services

Or manually:
```bash
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

---

## 📖 API Documentation

Interactive API documentation available at `/api/docs` (Swagger UI) or `/api/redoc` (ReDoc).

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/services/` | GET | List service categories |
| `/api/open311/v2/requests.json` | POST | Submit request (public) |
| `/api/open311/v2/requests.json` | GET | List requests (staff) |
| `/api/auth/login` | POST | OAuth2 login |
| `/api/system/settings` | GET/POST | Branding settings |
| `/api/system/advanced-statistics` | GET | PostGIS analytics (staff) |

---

## 🔒 Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- CORS configured for API protection
- Caddy provides automatic HTTPS
- PII hidden from public endpoints
- Audit logging for all request changes

See [COMPLIANCE.md](COMPLIANCE.md) for detailed security posture and government compliance documentation.

---

## 🔧 Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker-compose logs db

# Restart the database
docker-compose restart db
```

### Frontend Not Loading
```bash
# Rebuild the frontend container
docker-compose build --no-cache frontend
docker-compose up -d
```

### Celery Tasks Not Running
```bash
# Check worker logs
docker-compose logs celery

# Restart the worker
docker-compose restart celery
```

### Maps Not Displaying
1. Verify `GOOGLE_MAPS_API_KEY` is configured in Admin Console
2. Check browser console for API errors
3. Ensure Maps JavaScript API is enabled in Google Cloud Console

### AI Analysis Not Working
1. Verify `VERTEX_AI_PROJECT` is configured
2. Check that service account has Vertex AI permissions
3. Review backend logs: `docker-compose logs backend`

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

<p align="center">
  Built with ❤️ for civic engagement
</p>
