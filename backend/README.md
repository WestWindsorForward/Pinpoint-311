# Township Request Management System Backend

FastAPI-based backend implementing Open311-compliant APIs, administrative configuration, resident portals, and staff command center logic for the Township Request Management System.

## Run locally

```bash
uv sync  # or pip install -r requirements.txt if preferred
uv run uvicorn app.main:app --reload
```

Set required environment variables via `.env` (see `app/core/config.py`).
