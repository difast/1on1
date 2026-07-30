#!/bin/sh
# Пакет app лежит в ../backend — добавляем его в PYTHONPATH (main.py делает то же
# самое от __file__, это дублирующая страховка на случай запуска из другой cwd).
export PYTHONPATH="$(cd "$(dirname "$0")/../backend" && pwd):${PYTHONPATH}"

# Миграции здесь НЕ запускаем: схему ведёт API (smartweb/backend/start.sh).
# Один воркер принципиально: вебхук должен обрабатывать один процесс.
echo "=== Starting Telegram bot on port ${PORT:-8080} ==="
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
