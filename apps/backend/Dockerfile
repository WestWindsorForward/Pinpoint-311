FROM python:3.11-slim as base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --system --create-home --shell /bin/bash appuser && \
    chmod +x ./entrypoint.sh

USER appuser

ENV PATH="/home/appuser/.local/bin:${PATH}" \
    PYTHONPATH="/app"

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
