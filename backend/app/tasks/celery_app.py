from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "smart_1on1",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "send-meeting-reminders": {
            "task": "app.tasks.reminders.send_meeting_reminders",
            "schedule": crontab(hour=8, minute=0),
        },
        "send-hourly-meeting-reminders": {
            "task": "app.tasks.reminders.send_hourly_meeting_reminders",
            "schedule": crontab(minute=0),  # every hour
        },
        "check-overdue-meetings": {
            "task": "app.tasks.reminders.check_overdue_meetings",
            "schedule": crontab(hour=9, minute=0),
        },
    },
)

celery_app.autodiscover_tasks(["app.tasks"])
