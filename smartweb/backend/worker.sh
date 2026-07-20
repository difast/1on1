#!/bin/sh
# Запуск Celery-воркера как ОТДЕЛЬНОГО приложения (тип «Python: Celery» в
# Timeweb App Platform), из того же репозитория, что и веб-часть, но с этой
# командой запуска вместо start.sh.
#
# --beat запускает встроенный планировщик (beat_schedule из celery_app.py) в том
# же процессе — этого достаточно для одного воркера. Если воркеров станет
# несколько, beat нужно вынести в отдельный процесс, чтобы задачи по расписанию
# не дублировались.
echo "=== Starting Celery worker (+ beat) ==="
exec celery -A app.tasks.celery_app.celery_app worker --beat --loglevel=info
