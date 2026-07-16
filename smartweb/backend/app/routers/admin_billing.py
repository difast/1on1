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
from app.models.manager import Manager
from app.utils.auth import require_admin
from app.services import subscriptions as subs
from app.services import metrics as metrics_service
from sqlalchemy import text

router = APIRouter()


@router.get("/metrics")
def investor_metrics(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Investor / SaaS KPIs (DAU/WAU/Workspaces/MRR/Retention/conversion/CAC/LTV/ROI)."""
    current = metrics_service.compute(db)
    history = []
    try:
        rows = db.execute(text(
            "SELECT day, dau, wau, workspaces, meetings_total, paid_count, trialing_count, mrr "
            "FROM metrics_daily ORDER BY day DESC LIMIT 90"
        )).fetchall()
        history = [
            {"day": str(r[0]), "dau": r[1], "wau": r[2], "workspaces": r[3],
             "meetings_total": r[4], "paid_count": r[5], "trialing_count": r[6],
             "mrr": round((r[7] or 0) / 100, 2)}
            for r in rows
        ]
    except Exception:
        pass
    return {"current": current, "history": history}


@router.get("/enforcement-audit")
def enforcement_audit(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Аудит перед включением ENTITLEMENTS_ENFORCE (Этап 1): аккаунты, чьё
    фактическое использование превышает лимиты их тарифа. Считает по лимитам
    тарифа (не по enforcement-состоянию), чтобы решить про grandfathering."""
    from datetime import datetime
    from app.services.entitlements import resolve_plan_code, entitlements_enforced
    from app.services.plans import get_plan
    from app.models.team import Team, TeamMember
    from app.models.meeting import Meeting

    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    out = []
    for u in db.query(User).all():
        code = resolve_plan_code(db, u)
        if code == "__unlimited__":
            continue
        plan = get_plan(db, code)
        lim = (plan.limits if plan else {}) or {}
        teams = db.query(Team).filter(Team.team_lead_id == u.id).all()
        viol = []
        maxt = lim.get("max_teams")
        if maxt is not None and len(teams) > maxt:
            viol.append({"kind": "teams", "limit": maxt, "actual": len(teams)})
        maxm = lim.get("max_members_per_team")
        if maxm is not None and teams:
            worst = max(
                db.query(TeamMember).filter(TeamMember.team_id == t.id, TeamMember.role != "lead").count()
                for t in teams
            )
            if worst > maxm:
                viol.append({"kind": "members", "limit": maxm, "actual": worst})
        maxmeet = lim.get("max_meetings_per_month")
        if maxmeet is not None:
            cnt = db.query(Meeting).filter(Meeting.team_lead_id == u.id, Meeting.created_at >= start).count()
            if cnt > maxmeet:
                viol.append({"kind": "meetings", "limit": maxmeet, "actual": cnt})
        if viol:
            out.append({"user_id": u.id, "name": u.name, "email": u.email, "plan": code, "violations": viol})
    return {"enforce_enabled": entitlements_enforced(), "count": len(out), "accounts": out}


def _sub_dict(s: Subscription, db: Session = None):
    d = {
        "id": s.id, "subject_type": s.subject_type, "subject_id": s.subject_id,
        "plan_code": s.plan_code, "status": s.status, "seats": s.seats,
        "billing_period": s.billing_period, "provider": s.provider,
        "trial_end": s.trial_end.isoformat() if s.trial_end else None,
        "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
        "cancel_at_period_end": s.cancel_at_period_end,
        "manager_id": s.manager_id, "manager_name": s.manager_name, "manager_contact": s.manager_contact,
    }
    # Имя/почта владельца — чтобы админ видел, чья это подписка (Task 2).
    if db is not None and s.subject_type == "user":
        u = db.query(User).filter(User.id == s.subject_id).first()
        d["user_name"] = u.name if u else None
        d["user_email"] = u.email if u else None
    return d


@router.get("/subscriptions")
def list_subscriptions(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = db.query(Subscription).order_by(Subscription.id.desc()).all()
    return [_sub_dict(s, db) for s in rows]


@router.get("/payments")
def list_payments(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = db.query(Payment).order_by(Payment.id.desc()).limit(500).all()
    users = {u.id: u for u in db.query(User).all()}
    out = []
    for p in rows:
        u = users.get(p.subject_id) if p.subject_type == "user" else None
        out.append({
            "id": p.id, "subscription_id": p.subscription_id,
            "subject_type": p.subject_type, "subject_id": p.subject_id,
            "user_name": u.name if u else None, "user_email": u.email if u else None,
            "amount": p.amount, "currency": p.currency, "status": p.status,
            "provider": p.provider, "external_id": p.external_id,
            "payload": p.payload,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return out


@router.get("/user/{user_id}")
def user_billing(user_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Всё о биллинге одного пользователя для админ-панели (Task 2):
    подписка (план/статус/период/менеджер) и его платежи."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    sub = subs.get_subscription(db, "user", user_id)
    pays = db.query(Payment).filter(
        Payment.subject_type == "user", Payment.subject_id == user_id
    ).order_by(Payment.id.desc()).limit(50).all()
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "billing_override": bool(user.billing_override)},
        "free_window": subs.free_window(db, user),
        "subscription": _sub_dict(sub, db) if sub else None,
        "payments": [
            {"id": p.id, "amount": p.amount, "currency": p.currency, "status": p.status,
             "provider": p.provider, "external_id": p.external_id,
             "created_at": p.created_at.isoformat() if p.created_at else None,
             "payload": p.payload}
            for p in pays
        ],
    }


# ── Реестр менеджеров (заводятся вручную, назначаются из списка) ──────────────

def _mgr_dict(m: Manager):
    return {"id": m.id, "name": m.name, "contact": m.contact}


@router.get("/managers")
def list_managers(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return [_mgr_dict(m) for m in db.query(Manager).order_by(Manager.name).all()]


class ManagerCreate(BaseModel):
    name: str
    contact: str | None = None


@router.post("/managers")
def create_manager(data: ManagerCreate, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Name required")
    m = Manager(name=name, contact=(data.contact or "").strip() or None)
    db.add(m); db.commit(); db.refresh(m)
    return _mgr_dict(m)


@router.delete("/managers/{manager_id}")
def delete_manager(manager_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    m = db.query(Manager).filter(Manager.id == manager_id).first()
    if not m:
        raise HTTPException(404, "Manager not found")
    # Снимаем менеджера со всех подписок, где он был назначен.
    for s in db.query(Subscription).filter(Subscription.manager_id == manager_id).all():
        s.manager_id = None; s.manager_name = None; s.manager_contact = None
    db.delete(m); db.commit()
    return {"ok": True}


class AssignManagerReq(BaseModel):
    manager_id: int | None = None   # None → снять назначение


@router.post("/users/{user_id}/manager")
def assign_manager(user_id: int, data: AssignManagerReq, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Назначить пользователю менеджера ИЗ РЕЕСТРА (по id) или снять (manager_id=None).
    На подписке хранится ссылка + снимок имени/контакта. Если подписки нет —
    заводим запись, чтобы было куда прикрепить."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    sub = subs.get_subscription(db, "user", user_id)
    if not sub:
        sub = subs.start_free_window(db, "user", user_id, days=14)
    if data.manager_id is None:
        sub.manager_id = None; sub.manager_name = None; sub.manager_contact = None
    else:
        m = db.query(Manager).filter(Manager.id == data.manager_id).first()
        if not m:
            raise HTTPException(404, "Manager not found")
        sub.manager_id = m.id
        sub.manager_name = m.name
        sub.manager_contact = m.contact
    db.commit(); db.refresh(sub)
    return _sub_dict(sub, db)


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
