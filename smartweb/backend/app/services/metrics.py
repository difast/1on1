"""Investor / SaaS metrics computed from live data.

Available now: DAU, WAU, Workspaces, # 1-on-1 meetings, MRR, plan distribution,
Free->Paid conversion, Retention 30d.
Need external inputs (env): CAC (marketing spend), ROI assumptions.
"""
import os
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.team import Team
from app.models.meeting import Meeting
from app.models.subscription import Subscription
from app.services.plans import get_plan

PAID_PLANS = ("start", "team", "company", "enterprise")


def _mrr_kopecks(db: Session) -> int:
    """Sum monthly recurring revenue from active paid subscriptions (kopecks)."""
    subs = db.query(Subscription).filter(
        Subscription.status == "active",
        Subscription.plan_code.in_(PAID_PLANS),
    ).all()
    total = 0
    for s in subs:
        plan = get_plan(db, s.plan_code)
        if not plan or plan.is_enterprise:
            continue
        per_month = plan.price_month
        if plan.per_seat:
            per_month *= max(s.seats, 1)
        total += int(per_month * 100)
    return total


def compute(db: Session) -> dict:
    now = datetime.utcnow()
    d1 = now - timedelta(days=1)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    dau = db.query(func.count(User.id)).filter(User.last_active_at >= d1).scalar() or 0
    wau = db.query(func.count(User.id)).filter(User.last_active_at >= d7).scalar() or 0
    workspaces = db.query(func.count(Team.id)).scalar() or 0
    meetings_total = db.query(func.count(Meeting.id)).filter(Meeting.status == "completed").scalar() or 0

    paid = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "active", Subscription.plan_code.in_(PAID_PLANS)
    ).scalar() or 0
    trialing = db.query(func.count(Subscription.id)).filter(Subscription.status == "trialing").scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0

    # Free -> Paid conversion: paid accounts / all accounts that ever signed up.
    free_to_paid = round((paid / total_users) * 100, 1) if total_users else 0.0

    # Retention 30d: of users registered >=30d ago, share active in the last 7d.
    cohort = db.query(func.count(User.id)).filter(User.created_at <= d30).scalar() or 0
    retained = db.query(func.count(User.id)).filter(
        User.created_at <= d30, User.last_active_at >= d7
    ).scalar() or 0
    retention_30d = round((retained / cohort) * 100, 1) if cohort else 0.0

    mrr = _mrr_kopecks(db)
    arpu = (mrr / paid) if paid else 0  # kopecks/month per paying account

    # External inputs (env). CAC needs ad spend; ROI needs an assumptions model.
    spend = float(os.getenv("MARKETING_SPEND_KOPECKS", "0"))  # period marketing spend
    new_paid = float(os.getenv("NEW_PAID_CUSTOMERS", "0"))
    cac = (spend / new_paid) if new_paid else None
    # LTV ≈ ARPU / monthly churn; churn assumption via env (default 5%/mo).
    churn = float(os.getenv("MONTHLY_CHURN", "0.05")) or 0.05
    ltv = (arpu / churn) if arpu else 0
    ltv_cac = (ltv / cac) if cac else None

    # ROI per customer (model): value delivered vs subscription cost.
    # value = saved hours/meeting * hourly rate * meetings; configurable.
    saved_h = float(os.getenv("ROI_SAVED_HOURS_PER_MEETING", "0.5"))
    rate = float(os.getenv("ROI_HOURLY_RATE_KOPECKS", "0"))  # kopecks/hour
    roi_value = saved_h * rate * (meetings_total / max(paid, 1))

    return {
        "dau": dau, "wau": wau, "workspaces": workspaces,
        "meetings_1on1": meetings_total,
        "mrr": round(mrr / 100, 2), "arpu": round(arpu / 100, 2),
        "paid_count": paid, "trialing_count": trialing, "total_users": total_users,
        "free_to_paid_pct": free_to_paid, "retention_30d_pct": retention_30d,
        "cac": round(cac / 100, 2) if cac is not None else None,
        "ltv": round(ltv / 100, 2) if ltv else 0,
        "ltv_cac_ratio": round(ltv_cac, 2) if ltv_cac is not None else None,
        "roi_per_customer_value": round(roi_value / 100, 2) if rate else None,
        "_inputs_note": "CAC/LTV/ROI требуют ввода: MARKETING_SPEND_KOPECKS, NEW_PAID_CUSTOMERS, MONTHLY_CHURN, ROI_HOURLY_RATE_KOPECKS",
    }


def snapshot(db: Session):
    """Persist a daily snapshot (called by the scheduler) for historical charts."""
    from datetime import date
    from app.models.plan import UsageCounter  # noqa: ensures models import
    from sqlalchemy import text
    m = compute(db)
    today = date.today()
    # upsert-ish: skip if today already stored
    exists = db.execute(text("SELECT 1 FROM metrics_daily WHERE day = :d"), {"d": today}).first()
    if exists:
        return
    db.execute(
        text("INSERT INTO metrics_daily (day, dau, wau, workspaces, meetings_total, paid_count, trialing_count, mrr) "
             "VALUES (:day,:dau,:wau,:ws,:mt,:paid,:tri,:mrr)"),
        {"day": today, "dau": m["dau"], "wau": m["wau"], "ws": m["workspaces"],
         "mt": m["meetings_1on1"], "paid": m["paid_count"], "tri": m["trialing_count"],
         "mrr": int(m["mrr"] * 100)},
    )
    db.commit()
