#!/bin/sh
# Run alembic with 10s timeout; ignore any failure (tables may already exist)
timeout 10 alembic upgrade head 2>&1 || true
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
