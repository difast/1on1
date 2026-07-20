#!/bin/sh
# alembic не добавляет текущую папку в sys.path (uvicorn добавляет), поэтому на
# Timeweb, где рабочая директория /app/smartweb/backend, нужен явный PYTHONPATH.
export PYTHONPATH="$(pwd):${PYTHONPATH}"

# Миграции запускаем В ФОНЕ и с таймаутом: они НЕ должны задерживать старт
# uvicorn. Иначе, если БД недоступна, alembic висит, порт не открывается, и
# платформенный health-check убивает контейнер, не дождавшись сервера.
# Схема на проде уже накатана, поэтому миграции по сути проверка/no-op.
(
  echo "=== Running Alembic migrations (background) ==="
  timeout 60 alembic upgrade head
  echo "=== Alembic finished (exit $?) ==="
) &

echo "=== Starting server on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
