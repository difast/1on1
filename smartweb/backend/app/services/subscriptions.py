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


# Регистрация = 14-дневный пробный период тарифа Start с полным доступом к его
# функциям. Так описан Start в тарифной сетке (plans.py).
SIGNUP_TRIAL_DAYS = 14
SIGNUP_TRIAL_PLAN = "start"


def start_signup_trial(db: Session, subject_type: str, subject_id: int,
                       days: int = SIGNUP_TRIAL_DAYS,
                       plan_code: str = SIGNUP_TRIAL_PLAN) -> Subscription:
    """При регистрации — пробный период тарифа Start на 14 дней.
    Не трогаем уже существующую подписку (напр. заведена админом)."""
    existing = get_subscription(db, subject_type, subject_id)
    if existing:
        return existing
    return start_trial(db, subject_type, subject_id, plan_code, days=days)


# Совместимость со старым именем (вызовы могли остаться в внешних скриптах).
start_signup_free = start_signup_trial


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


def access_window(db: Session, user) -> dict:
    """Состояние бесплатного окна доступа: пробный период тарифа Start (после
    регистрации) либо старое Free-окно у аккаунтов, заведённых до смены сетки.

    until=None — окна нет (платная подписка или бессрочная запись).
    """
    empty = {"until": None, "expired": False, "trial_plan": None}
    if user is None:
        return empty
    sub = get_subscription(db, "user", user.id)
    if not sub:
        return empty
    if sub.status == "trialing":
        end = sub.trial_end or sub.current_period_end
        if not end:
            return empty
        return {"until": end.isoformat(), "expired": end < datetime.utcnow(),
                "trial_plan": sub.plan_code}
    if sub.status == "free" and sub.current_period_end:
        return {"until": sub.current_period_end.isoformat(),
                "expired": sub.current_period_end < datetime.utcnow(),
                "trial_plan": None}
    return empty


def free_window(db: Session, user) -> dict:
    """Старая форма ответа (free_until/free_expired) — оставлена, чтобы не
    ломать уже написанные вызовы; данные берутся из access_window."""
    w = access_window(db, user)
    return {"free_until": w["until"], "free_expired": w["expired"]}


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
    sub.pending_plan_code = None
    sub.pending_period = None
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


# ── Отложенный даунгрейд платный->платный (Этап 4) ───────────────────────────

def schedule_downgrade(db: Session, sub: Subscription, plan_code: str,
                       period: str = "month") -> Subscription:
    """Запланировать переход на более дешёвый ПЛАТНЫЙ тариф с начала следующего
    расчётного периода: текущие лимиты сохраняются до конца оплаченного периода,
    затем крон применит новый тариф (apply_pending_downgrade)."""
    sub.pending_plan_code = plan_code
    sub.pending_period = period
    sub.updated_at = datetime.utcnow()
    db.commit(); db.refresh(sub)
    return sub


def apply_pending_downgrade(db: Session, sub: Subscription) -> Subscription:
    """Применить отложенный даунгрейд: активировать запланированный тариф на новый
    период и очистить pending. Вызывается кроном по окончании оплаченного периода."""
    code = sub.pending_plan_code
    period = sub.pending_period or "month"
    sub.pending_plan_code = None
    sub.pending_period = None
    if not code:
        db.commit(); db.refresh(sub)
        return sub
    if code == "free":
        return downgrade_to_free(db, sub)
    return activate(db, "user", sub.subject_id, code, period=period,
                    provider=sub.provider, external_id=sub.external_id)


def run_maintenance(db: Session, now: datetime | None = None) -> dict:
    """Крон обслуживания подписок (Этап 4). Идемпотентно, безопасно к повторному
    запуску:
      1. Пробный период истёк -> перевод на Free (доступ к платным функциям
         закрывается, автосписаний нет — карты на триале не было).
      2. Отложенный даунгрейд платный->платный: период закончился -> применить
         запланированный тариф.
      3. Отмена в конце периода (cancel_at_period_end): период закончился ->
         перевод на Free.
    Реальных списаний здесь нет: продление оплаченных подписок делает провайдер
    рекуррентными платежами (webhook), а не этот крон.
    """
    now = now or datetime.utcnow()
    stats = {"trials_expired": 0, "downgrades_applied": 0, "canceled": 0}

    # 1. Истёкшие триалы.
    for sub in (db.query(Subscription)
                .filter(Subscription.status == "trialing",
                        Subscription.trial_end.isnot(None),
                        Subscription.trial_end <= now).all()):
        downgrade_to_free(db, sub)
        stats["trials_expired"] += 1

    # 2/3. Активные подписки, у которых закончился оплаченный период.
    for sub in (db.query(Subscription)
                .filter(Subscription.status == "active",
                        Subscription.current_period_end.isnot(None),
                        Subscription.current_period_end <= now).all()):
        if sub.pending_plan_code:
            apply_pending_downgrade(db, sub)
            stats["downgrades_applied"] += 1
        elif sub.cancel_at_period_end:
            downgrade_to_free(db, sub)
            stats["canceled"] += 1
        # Иначе (обычная активная подписка) продление делает провайдер — не трогаем.
    return stats
