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
from app.services import plan_change

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
    subscription = None
    if user is not None:
        usage = {
            "meetings_this_month": get_usage(db, "user", user.id, "meetings"),
            "ai_requests_this_month": get_usage(db, "user", user.id, "ai_requests"),
        }
        # Состояние подписки нужно фронту, чтобы рисовать правильные сценарии
        # (grace-period, отмена в конце периода, триал) — Этап 5.
        sub = subs.get_subscription(db, "user", user.id)
        if sub:
            subscription = {
                "status": sub.status,            # free/trialing/active/past_due/canceled
                "plan_code": sub.plan_code,
                "billing_period": sub.billing_period,
                "seats": sub.seats,
                "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
                "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
                "cancel_at_period_end": bool(sub.cancel_at_period_end),
                "in_grace": sub.status == "past_due",
            }

    free = subs.free_window(db, user) if user is not None else {"free_until": None, "free_expired": False}

    return {
        "plan_code": code if code != "__unlimited__" else "unlimited",
        "full_access_override": bool(user and getattr(user, "billing_override", False)),
        "limits": limits,
        "usage": usage,
        "subscription": subscription,
        "free_until": free.get("free_until"),      # конец 14-дневного окна Free
        "free_expired": free.get("free_expired"),  # окно Free истекло
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


class ChangeReq(BaseModel):
    plan_code: str
    period: str = "month"
    seats: int = 1
    user_id: int | None = None


@router.post("/change/preview")
def change_preview(data: ChangeReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Единая точка решения для лендинга и ЛК: что произойдёт при смене тарифа
    (Этап 5.12). Ничего не меняет — только возвращает сценарий и текст для UI."""
    user = current or (db.query(User).filter(User.id == data.user_id).first() if data.user_id else None)
    return plan_change.decide(db, user, data.plan_code, data.period, data.seats)


class CancelReq(BaseModel):
    user_id: int | None = None


@router.post("/cancel")
def cancel_subscription(data: CancelReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Отмена подписки / переход на Free (5.5, 6.6): доступ сохраняется до конца
    оплаченного периода, затем аккаунт переходит на Free. Мутирует только запись
    подписки самого пользователя, без списаний. С живыми ключами здесь же
    дёргается Subscriptions/Cancel провайдера (см. plan_change / provider)."""
    user = current or (db.query(User).filter(User.id == data.user_id).first() if data.user_id else None)
    if user is None:
        raise HTTPException(401, "User required")
    sub = subs.get_subscription(db, "user", user.id)
    if not sub or sub.status not in ("active", "trialing", "past_due"):
        return {"ok": True, "status": sub.status if sub else "free", "note": "Активной подписки нет."}
    subs.cancel(db, sub, at_period_end=True)
    return {"ok": True, "status": sub.status, "cancel_at_period_end": True,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None}


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

    # ── Подписочное уведомление (Recurrent/Cancel): меняем статус подписки ──
    # Fail НЕ понижает мгновенно — переводим в grace (past_due); Cancelled —
    # отмена с конца периода; Expired — переход на Free (Этап 6.3, 5.8).
    if data.get("kind") == "subscription":
        acc = data.get("account_id")
        if not acc:
            return {"code": 0}
        try:
            uid = int(acc)
        except (TypeError, ValueError):
            return {"code": 0}
        sub = subs.get_subscription(db, "user", uid)
        if not sub:
            return {"code": 0}
        st = (data.get("sub_status") or "").lower()
        if st == "active":
            subs.extend(db, sub, period=sub.billing_period)     # успешное продление
        elif st in ("pastdue", "rejected"):
            subs.set_status(db, sub, "past_due")                 # grace-период
        elif st == "cancelled":
            subs.cancel(db, sub, at_period_end=True)             # доступ до конца периода
        elif st == "expired":
            subs.downgrade_to_free(db, sub)                      # период истёк
        return {"code": 0}

    # ── Платёжное уведомление (Pay/Fail) ──
    # Idempotency: дубликаты по внешнему id транзакции игнорируем.
    ext = str(data.get("external_id") or "")
    if ext and db.query(Payment).filter(Payment.external_id == ext).first():
        return {"code": 0}

    invoice_id = data.get("invoice_id")
    pay = db.query(Payment).filter(Payment.id == int(invoice_id)).first() if invoice_id else None
    if not pay:
        return {"code": 0}  # acknowledge; nothing to do

    if not data.get("success"):
        # Неудачный платёж: платёж — failed; если это списание по уже активной
        # подписке — переводим её в grace (past_due), НЕ понижаем сразу (5.8/6.3).
        pay.status = "failed"; pay.external_id = ext or pay.external_id
        sub = subs.get_subscription(db, "user", pay.subject_id)
        if sub and sub.status in ("active", "trialing"):
            subs.set_status(db, sub, "past_due")
        db.commit()
        return {"code": 0}

    pay.status = "succeeded"
    pay.external_id = ext or pay.external_id
    info = pay.payload or {}
    db.commit()

    # Успешный платёж — активируем/продлеваем подписку (в т.ч. выход из grace).
    subs.activate(
        db, "user", pay.subject_id, info.get("plan_code", "start"),
        period=info.get("period", "month"), seats=info.get("seats", 1),
        provider="cloudpayments", external_id=ext,
    )
    pay.subscription_id = subs.get_subscription(db, "user", pay.subject_id).id
    db.commit()
    return {"code": 0}
