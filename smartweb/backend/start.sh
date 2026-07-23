#!/bin/sh
# alembic не добавляет текущую папку в sys.path (uvicorn добавляет), поэтому на
# Timeweb, где рабочая директория /app/smartweb/backend, нужен явный PYTHONPATH.
export PYTHONPATH="$(pwd):${PYTHONPATH}"

# Миграции запускаем В ФОНЕ (порт открывается сразу — health-check платформы не
# убивает контейнер), НО перед стартом сервера ждём их завершения с ограниченным
# таймаутом. Так исключаем окно, когда новый код обращается к колонкам, которых
# ещё нет в БД (аддитивные миграции быстрые — обычно доли секунды). Если БД
# недоступна и alembic висит — по таймауту всё равно поднимаем сервер, чтобы
# отдать health-check и не уйти в бесконечный рестарт.
echo "=== Running Alembic migrations (up to 90s) ==="
timeout 90 alembic upgrade head && echo "=== Alembic finished OK ===" \
  || echo "=== WARN: migrations did not finish (exit $?); starting server anyway ==="

echo "=== Starting server on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
