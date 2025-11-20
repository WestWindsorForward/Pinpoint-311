FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY . .
RUN pip install --upgrade pip && pip install .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
