# Image unique pour l'API et le worker de correction.
FROM python:3.12-slim

# gcc / g++ : compilation des productions C et C++ des apprenants
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

# Le code des apprenants ne tourne jamais en root
RUN useradd --create-home --uid 10001 codeval
USER codeval

EXPOSE 8000
CMD ["sh", "-c", "python -m app.prestart && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
