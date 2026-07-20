#!/bin/sh
# Миграции с таймаутом: если БД недоступна, alembic не должен висеть вечно и
# блокировать запуск веб-сервера (иначе на порту никто не слушает и снаружи
# «нет соединения»). По таймауту/ошибке всё равно поднимаем uvicorn —
# liveness /healthz заработает, а состояние БД видно в /api/health.
echo "=== Running Alembic migrations ==="
timeout 90 alembic upgrade head
EXIT=$?
if [ $EXIT -ne 0 ]; then
  echo "!!! Alembic did not finish (exit $EXIT) — starting server anyway ==="
fi
echo "=== Starting server on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
