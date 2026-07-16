"""Subscription lifecycle.

State machine: free -> trialing -> active -> past_due -> blocked/canceled.
Used by entitlements (to resolve the effective plan) and by admin/billing.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.subscription import Subscription

ACTIVE_STATES = ("trialing", "active")


def get_subscription(db: Session, subject_type: str, subject_id: int):
    return (
        db.query(Subscription)
        .filter(Subscription.subject_type == subject_type, Subscription.subject_id == subject_id)
        .order_by(Subscription.id.desc())
        .first()
    )


def active_plan_code_for_user(db: Session, user) -> str | None:
    """Effective plan code from an active/trialing subscription, else None."""
    if user is None:
        return None
    sub = get_subscription(db, "user", user.id)
    if not sub:
        return None
    now = datetime.utcnow()
    if sub.status in ACTIVE_STATES:
        # trialing/active are valid until period/trial end (None = open-ended,
        # e.g. manually activated enterprise).
        end = sub.current_period_end or sub.trial_end
        if end is None or end > now:
            return sub.plan_code
    return None


def _upsert(db: Session, subject_type: str, subject_id: int) -> Subscription:
    sub = get_subscription(db, subject_type, subject_id)
    if not sub:
        sub = Subscription(subject_type=subject_type, subject_id=subject_id, plan_code="free", status="free")
        db.add(sub)
    return sub


# Бесплатный старт = тариф Free (только заявленные для Free функции), с
# 14-дневным окном. Полного набора функций Free НЕ даёт.
SIGNUP_FREE_DAYS = 14


def start_signup_free(db: Session, subject_type: str, subject_id: int, days: int = SIGNUP_FREE_DAYS) -> Subscription:
    """При регистрации — тариф Free с 14-дневным окном (без карты).
    Не трогаем уже существующую подписку (напр. заведён админом)."""
    return start_free_window(db, subject_type, subject_id, days=days)


def start_free_window(db: Session, subject_type: str, subject_id: int, days: int | None = None) -> Subscription:
    """Free-запись (точка привязки, в т.ч. для менеджера). При days задаёт
    14-дневное окно (current_period_end); без days — бессрочная запись."""
    existing = get_subscription(db, subject_type, subject_id)
    if existing:
        return existing
    sub = Subscription(
        subject_type=subject_type, subject_id=subject_id,
        plan_code="free", status="free",
        current_period_end=(datetime.utcnow() + timedelta(days=days)) if days else None,
    )
    db.add(sub); db.commit(); db.refresh(sub)
    return sub


def free_window(db: Session, user) -> dict:
    """Состояние 14-дневного окна Free. free_until=None — без ограничения."""
    empty = {"free_until": None, "free_expired": False}
    if user is None:
        return empty
    sub = get_subscription(db, "user", user.id)
    if not sub or sub.status != "free" or not sub.current_period_end:
        return empty
    return {
        "free_until": sub.current_period_end.isoformat(),
        "free_expired": sub.current_period_end < datetime.utcnow(),
    }


def start_trial(db: Session, subject_type: str, subject_id: int, plan_code: str, days: int = 14) -> Subscription:
    sub = _upsert(db, subject_type, subject_id)
    sub.plan_code = plan_code
    sub.status = "trialing"
    sub.trial_end = datetime.utcnow() + timedelta(days=days)
    sub.current_period_end = sub.trial_end
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def activate(db: Session, subject_type: str, subject_id: int, plan_code: str,
             period: str = "month", seats: int = 1, provider: str = None,
             external_id: str = None, period_end: datetime = None) -> Subscription:
    sub = _upsert(db, subject_type, subject_id)
    sub.plan_code = plan_code
    sub.status = "active"
    sub.billing_period = period
    sub.seats = seats
    sub.provider = provider
    if external_id:
        sub.external_id = external_id
    if period_end is None:
        period_end = datetime.utcnow() + timedelta(days=365 if period == "year" else 30)
    sub.current_period_end = period_end
    sub.cancel_at_period_end = False
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def extend(db: Session, sub: Subscription, period: str = None) -> Subscription:
    period = period or sub.billing_period
    base = sub.current_period_end or datetime.utcnow()
    if base < datetime.utcnow():
        base = datetime.utcnow()
    sub.current_period_end = base + timedelta(days=365 if period == "year" else 30)
    sub.status = "active"
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def set_status(db: Session, sub: Subscription, status: str) -> Subscription:
    sub.status = status
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def cancel(db: Session, sub: Subscription, at_period_end: bool = True) -> Subscription:
    if at_period_end:
        sub.cancel_at_period_end = True
    else:
        sub.status = "canceled"
        sub.plan_code = "free"
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def downgrade_to_free(db: Session, sub: Subscription) -> Subscription:
    sub.plan_code = "free"
    sub.status = "free"
    sub.cancel_at_period_end = False
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub
