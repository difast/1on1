#!/bin/sh
echo "=== Running Alembic migrations ==="
alembic upgrade head
EXIT=$?
if [ $EXIT -ne 0 ]; then
  echo "!!! Alembic failed (exit $EXIT), starting server anyway ==="
fi
echo "=== Starting server on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
