"""Крон обслуживания подписок (Этап 4): истёкшие триалы, отложенные даунгрейды
платный->платный, отмена в конце периода.

Реальных списаний здесь НЕТ: продление оплаченных подписок делает провайдер
рекуррентными платежами (webhook). Этот крон только применяет изменения статусов
и отложенные переходы тарифов, которые не привязаны к платежу.
"""
import logging

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.services import subscriptions as subs

log = logging.getLogger("billing.maintenance")


@celery_app.task(name="app.tasks.billing_tasks.run_subscription_maintenance")
def run_subscription_maintenance():
    db = SessionLocal()
    try:
        stats = subs.run_maintenance(db)
        log.info("subscription maintenance: %s", stats)
        return stats
    except Exception as e:  # крон не должен падать молча — но и не ронять воркер
        log.warning("subscription maintenance failed: %s", type(e).__name__)
        return {"error": type(e).__name__}
    finally:
        db.close()
