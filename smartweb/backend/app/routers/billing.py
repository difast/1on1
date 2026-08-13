"""Billing API — plan catalog + the caller's current entitlements.

GET /api/billing/plans  -> public tariff catalog (mirrors the pricing page)
GET /api/billing/me     -> the caller's effective plan, limits and usage
"""
import logging

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

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, OptTextStr, UrlStr, TokenStr, EntityId, OptEntityId,
    OptPushTokenStr,
)


router = APIRouter()

# Журнал платёжных вебхуков. Пишем ТОЛЬКО безопасные поля для расследования
# спорных ситуаций (вид уведомления, идентификаторы платежа/подписки, счёт,
# результат обработки). НИКОГДА не логируем тело формы целиком и платёжные
# реквизиты (маскированный номер карты и т.п.), чтобы чувствительные данные не
# оседали в логах.
wh_log = logging.getLogger("billing.webhook")


def _safe_wh_fields(data: dict) -> dict:
    """Отобрать из разобранного уведомления только безопасные для лога поля."""
    return {
        "kind": data.get("kind"),
        "event": data.get("event"),
        "external_id": data.get("external_id"),
        "subscription_id": data.get("subscription_id"),
        "sub_status": data.get("sub_status"),
        "account_id": data.get("account_id"),
        "invoice_id": data.get("invoice_id"),
        "success": data.get("success"),
    }


@router.get("/plans")
def get_plans(db: Session = Depends(get_db)):
    plans = list_plans(db)
    return [
        {
            "code": p.code, "name": p.name,
            "price_month": p.price_month, "price_year": p.price_year,
            "currency": p.currency, "per_seat": p.per_seat,
            # is_enterprise = договорной тариф (Business, Enterprise):
            # самостоятельной оплаты нет, только «Связаться с нами».
            "is_enterprise": p.is_enterprise, "limits": p.limits,
            # Дублируем ключевые поля витрины наверх, чтобы веб, приложение и
            # Mini App брали одни и те же строки, а не собирали их сами.
            "public": (p.limits or {}).get("public", True),
            "billing_period": (p.limits or {}).get("billing_period"),
            "price_label": (p.limits or {}).get("price_label"),
            "users_label": (p.limits or {}).get("users_label"),
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
                "manager_name": sub.manager_name,
                "manager_contact": sub.manager_contact,
            }

    window = subs.access_window(db, user) if user is not None else {"until": None, "expired": False, "trial_plan": None}
    plan = get_plan(db, code) if code != "__unlimited__" else None

    return {
        "plan_code": code if code != "__unlimited__" else "unlimited",
        "plan_name": plan.name if plan else ("Полный доступ" if code == "__unlimited__" else code),
        "price_label": (plan.limits or {}).get("price_label") if plan else None,
        "users_label": (plan.limits or {}).get("users_label") if plan else None,
        "billing_period": (plan.limits or {}).get("billing_period") if plan else None,
        "full_access_override": bool(user and getattr(user, "billing_override", False)),
        "limits": limits,
        "usage": usage,
        "subscription": subscription,
        # Функции, закрытые на время пробного периода (Team: ONE AI, Развитие).
        "trial_restricted_features": limits.get("trial_restricted_features") or [],
        # 14-дневное окно бесплатного доступа (пробный период Start либо
        # унаследованное Free-окно). Старые ключи сохранены для совместимости.
        "trial_until": window.get("until"),
        "trial_expired": window.get("expired"),
        "trial_plan": window.get("trial_plan"),
        "free_until": window.get("until"),
        "free_expired": window.get("expired"),
    }


def _amount_kopecks(plan, period: str | None = None) -> int:
    """Сумма списания в копейках за расчётный период тарифа.
    Start — 1 990 ₽/мес, Team — 4 990 ₽/мес ИЛИ 49 990 ₽/год (по выбору),
    Business — 9 990 ₽/мес. Период тарифа — см. plan_change.plan_period."""
    return int(round(plan_change.charge_amount(plan, period) * 100))


class CheckoutReq(BaseModel):
    plan_code: ShortStr
    # month | year — учитывается только для тарифов с выбором периода (Team);
    # у остальных период задаёт сам тариф.
    period: ShortStr = "month"
    # Число мест влияет на сумму списания — верхняя граница обязательна.
    seats: Annotated[int, Field(ge=1, le=10000)] = 1
    user_id: OptEntityId = None


@router.post("/checkout")
def checkout(data: CheckoutReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Create a pending payment and return the data to open the CloudPayments widget.
    Activation happens later, only via the verified webhook."""
    user = current or (db.query(User).filter(User.id == data.user_id).first() if data.user_id else None)
    if user is None:
        raise HTTPException(401, "User required")

    # ЕДИНСТВЕННЫЙ жёсткий барьер (Этап 5/6): оплата требует подтверждённого
    # email — независимо от способа регистрации. Формулировка разная для тех,
    # у кого email нет вовсе (Telegram-only), и для тех, у кого он не подтверждён.
    if not user.email_confirmed:
        if not user.email:
            raise HTTPException(status_code=403, detail={
                "code": "email_required",
                "message": "Для оформления подписки укажите и подтвердите email в настройках профиля.",
            })
        raise HTTPException(status_code=403, detail={
            "code": "email_unconfirmed",
            "message": "Для оформления подписки подтвердите email. Мы отправили письмо со ссылкой; можно отправить его повторно.",
        })

    plan = get_plan(db, data.plan_code)
    if plan is None:
        raise HTTPException(400, "Unknown plan")
    # Business и Enterprise — договорные: самостоятельной оплаты нет,
    # оформление ручное через продажи (plan_change отдаёт contact_sales).
    if plan.is_enterprise:
        raise HTTPException(status_code=400, detail={
            "code": "contract_plan",
            "message": f"Тариф {plan.name} подключается индивидуально — напишите нам, "
                       f"и мы подберём условия. Оплатить его картой в личном кабинете нельзя.",
        })

    period = plan_change.plan_period(plan, data.period)   # Team: month|year по выбору
    amount = _amount_kopecks(plan, period)
    period_ru = "год" if period == "year" else "месяц"
    pay = Payment(
        subject_type="user", subject_id=user.id, amount=amount, currency=plan.currency,
        status="pending", provider="cloudpayments",
        payload={"plan_code": plan.code, "period": period, "seats": data.seats},
    )
    db.add(pay); db.commit(); db.refresh(pay)

    provider = get_provider()
    cfg = provider.checkout_config(
        amount=amount, currency=plan.currency,
        description=f"OneOnOne — тариф {plan.name}, {period_ru}",
        account_id=str(user.id), invoice_id=str(pay.id), recurrent=True,
        period=period,
    )
    return {"payment_id": pay.id, "checkout": cfg}


class ChangeReq(BaseModel):
    plan_code: ShortStr
    period: ShortStr = "month"
    seats: Annotated[int, Field(ge=1, le=10000)] = 1
    user_id: OptEntityId = None


@router.post("/change/preview")
def change_preview(data: ChangeReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Единая точка решения для лендинга и ЛК: что произойдёт при смене тарифа
    (Этап 5.12). Ничего не меняет — только возвращает сценарий и текст для UI."""
    user = current or (db.query(User).filter(User.id == data.user_id).first() if data.user_id else None)
    return plan_change.decide(db, user, data.plan_code, data.period, data.seats)


class CancelReq(BaseModel):
    user_id: OptEntityId = None


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
    from app.services import audit
    audit.record(db, "billing.subscription_cancelled", actor_id=user.id, entity_type="subscription",
                 entity_id=sub.id, organization_id=audit.org_of_user(db, user.id), category="general",
                 summary="Пользователь отменил подписку (до конца периода)",
                 meta={"plan_code": sub.plan_code})
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
        # but never activate anything. Логируем сам факт неверной подписи (без тела).
        wh_log.warning("payment webhook rejected: bad signature")
        raise HTTPException(status_code=401, detail="bad signature")

    form = dict((await request.form()))
    data = provider.parse_webhook(form)
    # Факт получения проверенного вебхука — только безопасные поля, без тела формы
    # и платёжных реквизитов.
    wh_log.info("payment webhook received: %s", _safe_wh_fields(data))

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
        wh_log.info("subscription webhook applied: uid=%s sub_status=%s", uid, st)
        return {"code": 0}

    # ── Платёжное уведомление (Pay/Fail) ──
    # Idempotency: дубликаты по внешнему id транзакции (TransactionId) игнорируем.
    # Ретраи доставки на стороне CloudPayments — обычная практика, повторная
    # обработка не должна активировать доступ или создавать дубли.
    ext = str(data.get("external_id") or "")
    if ext and db.query(Payment).filter(Payment.external_id == ext).first():
        wh_log.info("payment webhook duplicate ignored: external_id=%s", ext)
        return {"code": 0}

    invoice_id = data.get("invoice_id")
    pay = db.query(Payment).filter(Payment.id == int(invoice_id)).first() if invoice_id else None
    if not pay:
        wh_log.info("payment webhook: no matching invoice (invoice_id=%s)", invoice_id)
        return {"code": 0}  # acknowledge; nothing to do

    if not data.get("success"):
        # Неудачный платёж: платёж — failed; если это списание по уже активной
        # подписке — переводим её в grace (past_due), НЕ понижаем сразу (5.8/6.3).
        pay.status = "failed"; pay.external_id = ext or pay.external_id
        sub = subs.get_subscription(db, "user", pay.subject_id)
        if sub and sub.status in ("active", "trialing"):
            subs.set_status(db, sub, "past_due")
        db.commit()
        wh_log.info("payment webhook: failed payment recorded (invoice_id=%s, uid=%s)",
                    pay.id, pay.subject_id)
        return {"code": 0}

    # Успешный платёж. ПОРЯДОК ВАЖЕН для атомарности/идемпотентности: сначала
    # активируем подписку (upsert, идемпотентно по external_id), и только ПОСЛЕ
    # успеха фиксируем external_id на платеже. Иначе при сбое активации после
    # записи external_id ретрай был бы отброшен дедупликацией, а подписка так и
    # осталась бы неактивной.
    info = pay.payload or {}
    sub = subs.activate(
        db, "user", pay.subject_id, info.get("plan_code", "start"),
        period=info.get("period", "month"), seats=info.get("seats", 1),
        provider="cloudpayments", external_id=ext,
    )
    pay.status = "succeeded"
    pay.external_id = ext or pay.external_id
    pay.subscription_id = sub.id if sub else None
    db.commit()
    wh_log.info("payment webhook: subscription activated (invoice_id=%s, uid=%s, plan=%s)",
                pay.id, pay.subject_id, info.get("plan_code", "start"))
    from app.services import audit
    audit.record(db, "billing.subscription_activated", actor_id=pay.subject_id,
                 entity_type="subscription", entity_id=sub.id if sub else None,
                 organization_id=audit.org_of_user(db, pay.subject_id), category="general",
                 summary=f"Подписка активирована/продлена: тариф {info.get('plan_code', 'start')}",
                 meta={"plan_code": info.get("plan_code", "start"), "period": info.get("period", "month")})
    return {"code": 0}
