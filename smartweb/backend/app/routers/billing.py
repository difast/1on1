"""Billing API — plan catalog + the caller's current entitlements.

GET /api/billing/plans  -> public tariff catalog (mirrors the pricing page)
GET /api/billing/me     -> the caller's effective plan, limits and usage
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user
from app.services.plans import list_plans
from app.services.entitlements import (
    effective_limits, resolve_plan_code, get_usage,
)

router = APIRouter()


@router.get("/plans")
def get_plans(db: Session = Depends(get_db)):
    plans = list_plans(db)
    return [
        {
            "code": p.code, "name": p.name,
            "price_month": p.price_month, "price_year": p.price_year,
            "currency": p.currency, "per_seat": p.per_seat,
            "is_enterprise": p.is_enterprise, "limits": p.limits,
        }
        for p in plans
    ]


@router.get("/me")
def billing_me(
    user_id: int = Query(None),
    db: Session = Depends(get_db),
    current=Depends(get_current_user),
):
    # Prefer the authenticated user; fall back to ?user_id= while auth is not
    # yet enforced (the app currently identifies users this way).
    user = current
    if user is None and user_id is not None:
        user = db.query(User).filter(User.id == user_id).first()

    code = resolve_plan_code(db, user)
    limits = effective_limits(db, user)

    usage = {}
    if user is not None:
        usage = {
            "meetings_this_month": get_usage(db, "user", user.id, "meetings"),
            "ai_requests_this_month": get_usage(db, "user", user.id, "ai_requests"),
        }

    return {
        "plan_code": code if code != "__unlimited__" else "unlimited",
        "full_access_override": bool(user and getattr(user, "billing_override", False)),
        "limits": limits,
        "usage": usage,
    }
