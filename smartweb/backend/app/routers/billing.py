"""Billing API — plan catalog + the caller's current entitlements.

GET /api/billing/plans  -> public tariff catalog (mirrors the pricing page)
GET /api/billing/me     -> the caller's effective plan, limits and usage
"""
from fastapi import APIRouter, Depends, Query, Request, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.subscription import Payment
from app.utils.auth import get_current_user
from app.services.plans import list_plans, get_plan
from app.services.entitlements import (
    effective_limits, resolve_plan_code, get_usage,
)
from app.services.payments_base import get_provider
from app.services import subscriptions as subs

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


def _amount_kopecks(plan, period: str, seats: int) -> int:
    """Charge amount in kopecks. Year price on the page is the discounted
    per-month figure → multiply by 12 for the annual charge."""
    base = plan.price_year * 12 if period == "year" else plan.price_month
    if plan.per_seat:
        base = base * max(seats, 1)
    return int(round(base * 100))


class CheckoutReq(BaseModel):
    plan_code: str
    period: str = "month"          # month | year
    seats: int = 1
    user_id: int | None = None


@router.post("/checkout")
def checkout(data: CheckoutReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Create a pending payment and return the data to open the CloudPayments widget.
    Activation happens later, only via the verified webhook."""
    user = current or (db.query(User).filter(User.id == data.user_id).first() if data.user_id else None)
    if user is None:
        raise HTTPException(401, "User required")
    plan = get_plan(db, data.plan_code)
    if plan is None or plan.is_enterprise:
        raise HTTPException(400, "Plan not purchasable self-serve")

    amount = _amount_kopecks(plan, data.period, data.seats)
    pay = Payment(
        subject_type="user", subject_id=user.id, amount=amount, currency=plan.currency,
        status="pending", provider="cloudpayments",
        payload={"plan_code": plan.code, "period": data.period, "seats": data.seats},
    )
    db.add(pay); db.commit(); db.refresh(pay)

    provider = get_provider()
    cfg = provider.checkout_config(
        amount=amount, currency=plan.currency,
        description=f"OneOnOne — тариф {plan.name} ({data.period})",
        account_id=str(user.id), invoice_id=str(pay.id), recurrent=True,
    )
    return {"payment_id": pay.id, "checkout": cfg}


@router.post("/webhooks/cloudpayments")
async def cloudpayments_webhook(
    request: Request,
    db: Session = Depends(get_db),
    content_hmac: str = Header(None, alias="Content-HMAC"),
    x_content_hmac: str = Header(None, alias="X-Content-HMAC"),
):
    """Single source of truth for activation. Verifies HMAC, is idempotent."""
    raw = await request.body()
    provider = get_provider()
    signature = content_hmac or x_content_hmac
    if not provider.verify_webhook(raw, signature):
        # Return 200 with code!=0 so the provider stops retrying a bad signature,
        # but never activate anything.
        raise HTTPException(status_code=401, detail="bad signature")

    form = dict((await request.form()))
    data = provider.parse_webhook(form)

    # Idempotency: ignore duplicates by external transaction id.
    ext = str(data.get("external_id") or "")
    if ext and db.query(Payment).filter(Payment.external_id == ext).first():
        return {"code": 0}

    invoice_id = data.get("invoice_id")
    pay = db.query(Payment).filter(Payment.id == int(invoice_id)).first() if invoice_id else None
    if not pay:
        return {"code": 0}  # acknowledge; nothing to do

    if not data.get("success"):
        pay.status = "failed"; pay.external_id = ext or pay.external_id
        db.commit()
        return {"code": 0}

    pay.status = "succeeded"
    pay.external_id = ext or pay.external_id
    info = pay.payload or {}
    db.commit()

    # Activate / renew the subscription.
    subs.activate(
        db, "user", pay.subject_id, info.get("plan_code", "start"),
        period=info.get("period", "month"), seats=info.get("seats", 1),
        provider="cloudpayments", external_id=ext,
    )
    pay.subscription_id = subs.get_subscription(db, "user", pay.subject_id).id
    db.commit()
    return {"code": 0}
