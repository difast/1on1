"""Admin billing management (guarded by require_admin).

Manage subscriptions/payments/invoices, manually activate plans (enterprise),
start trials, and grant full-access override (complete rights, no subscription).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.subscription import Subscription, Payment, Invoice
from app.utils.auth import require_admin
from app.services import subscriptions as subs

router = APIRouter()


def _sub_dict(s: Subscription):
    return {
        "id": s.id, "subject_type": s.subject_type, "subject_id": s.subject_id,
        "plan_code": s.plan_code, "status": s.status, "seats": s.seats,
        "billing_period": s.billing_period, "provider": s.provider,
        "trial_end": s.trial_end.isoformat() if s.trial_end else None,
        "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
        "cancel_at_period_end": s.cancel_at_period_end,
    }


@router.get("/subscriptions")
def list_subscriptions(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = db.query(Subscription).order_by(Subscription.id.desc()).all()
    return [_sub_dict(s) for s in rows]


@router.get("/payments")
def list_payments(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = db.query(Payment).order_by(Payment.id.desc()).limit(500).all()
    return [
        {
            "id": p.id, "subscription_id": p.subscription_id,
            "subject_type": p.subject_type, "subject_id": p.subject_id,
            "amount": p.amount, "currency": p.currency, "status": p.status,
            "provider": p.provider, "external_id": p.external_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


class ActivateReq(BaseModel):
    subject_type: str = "user"
    subject_id: int
    plan_code: str
    period: str = "month"
    seats: int = 1


@router.post("/subscriptions/activate")
def activate_subscription(data: ActivateReq, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    s = subs.activate(db, data.subject_type, data.subject_id, data.plan_code,
                      period=data.period, seats=data.seats, provider="manual")
    return _sub_dict(s)


class TrialReq(BaseModel):
    subject_type: str = "user"
    subject_id: int
    plan_code: str = "team"
    days: int = 14


@router.post("/subscriptions/trial")
def start_trial(data: TrialReq, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    s = subs.start_trial(db, data.subject_type, data.subject_id, data.plan_code, days=data.days)
    return _sub_dict(s)


@router.post("/subscriptions/{sub_id}/extend")
def extend_subscription(sub_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    s = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not s:
        raise HTTPException(404, "Subscription not found")
    return _sub_dict(subs.extend(db, s))


@router.post("/subscriptions/{sub_id}/cancel")
def cancel_subscription(sub_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    s = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not s:
        raise HTTPException(404, "Subscription not found")
    return _sub_dict(subs.cancel(db, s, at_period_end=False))


class OverrideReq(BaseModel):
    enabled: bool
    note: str | None = None
    admin_id: int | None = None


@router.patch("/users/{user_id}/override")
def set_full_access_override(user_id: int, data: OverrideReq, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Grant/revoke complete rights without a subscription."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.billing_override = data.enabled
    user.billing_override_note = data.note if data.enabled else None
    user.billing_override_by = data.admin_id if data.enabled else None
    user.billing_override_at = datetime.utcnow() if data.enabled else None
    db.commit(); db.refresh(user)
    return {
        "id": user.id, "billing_override": user.billing_override,
        "billing_override_note": user.billing_override_note,
        "billing_override_at": user.billing_override_at.isoformat() if user.billing_override_at else None,
    }
