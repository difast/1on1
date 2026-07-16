"""Entitlements — the server decides what a subject may do.

The frontend only displays limits; this service is the source of truth.

Resolution order for a subject's effective plan:
  1. full-access override flag on the account  -> unlimited
  2. active/trialing subscription's plan        -> that plan   (added in etap 3)
  3. default                                    -> Free

Enforcement is gated by ENTITLEMENTS_ENFORCE so we can ship the logic and turn
hard blocking on only once billing is live (free users must not be blocked
before there's a way to pay).
"""
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.plan import Plan, UsageCounter
from app.services.plans import UNLIMITED_LIMITS, LOCKED_LIMITS, get_plan


def entitlements_enforced() -> bool:
    return os.getenv("ENTITLEMENTS_ENFORCE", "").lower() in ("1", "true", "yes")


def _free_limits(db: Session) -> dict:
    p = get_plan(db, "free")
    return dict(p.limits) if p else {}


def resolve_plan_code(db: Session, user) -> str:
    """Effective plan code for a user. Extended in etap 3 to read subscriptions."""
    if user is not None and getattr(user, "billing_override", False):
        return "__unlimited__"
    # etap 3 will look up the active subscription here.
    try:
        from app.services.subscriptions import active_plan_code_for_user
        code = active_plan_code_for_user(db, user)
        if code:
            return code
    except Exception:
        pass
    return "free"


def effective_limits(db: Session, user) -> dict:
    code = resolve_plan_code(db, user)
    if code == "__unlimited__":
        return dict(UNLIMITED_LIMITS)
    # Пробный период (14 дней полного доступа) истёк и enforcement включён —
    # доступ заблокирован до выбора тарифа. Без enforcement лимиты обычные (Free).
    if code == "free" and entitlements_enforced():
        try:
            from app.services.subscriptions import free_window
            if free_window(db, user).get("free_expired"):
                return dict(LOCKED_LIMITS)
        except Exception:
            pass
    p = get_plan(db, code) or get_plan(db, "free")
    return dict(p.limits) if p else {}


def feature_enabled(limits: dict, feature: str) -> bool:
    return bool((limits.get("features") or {}).get(feature, False))


def limit_value(limits: dict, key: str):
    """None means unlimited."""
    return limits.get(key)


# ---- monthly usage counters -------------------------------------------------

def _period() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def get_usage(db: Session, subject_type: str, subject_id: int, metric: str) -> int:
    row = (
        db.query(UsageCounter)
        .filter(
            UsageCounter.subject_type == subject_type,
            UsageCounter.subject_id == subject_id,
            UsageCounter.metric == metric,
            UsageCounter.period == _period(),
        )
        .first()
    )
    return row.value if row else 0


def incr_usage(db: Session, subject_type: str, subject_id: int, metric: str, by: int = 1) -> int:
    row = (
        db.query(UsageCounter)
        .filter(
            UsageCounter.subject_type == subject_type,
            UsageCounter.subject_id == subject_id,
            UsageCounter.metric == metric,
            UsageCounter.period == _period(),
        )
        .first()
    )
    if row:
        row.value += by
    else:
        row = UsageCounter(
            subject_type=subject_type, subject_id=subject_id,
            metric=metric, period=_period(), value=by,
        )
        db.add(row)
    db.commit()
    return row.value
