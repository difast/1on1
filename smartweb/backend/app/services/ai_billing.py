"""Учёт AI-себестоимости и квот (Этап 2). Provider-agnostic.

Идея: тариф НЕ привязан к числу токенов. Внутри мы считаем фактическую
стоимость каждого AI-запроса в рублях по ценам за токен из конфигурации
(settings.ai_price_input/output_rub_per_mtok) и сравниваем накопленный за месяц
расход с AI-бюджетом организации. Смена модели/провайдера меняет только числа в
конфиге и settings.ai_gateway_model — формула и учёт не трогаются.

Формула (см. 2.1):
    AI Cost = input(млн) * цена_за_млн_input + output(млн) * цена_за_млн_output

Деньги считаем в микрорублях (целое, 1e-6 ₽), чтобы не терять доли копейки.

Владелец бюджета — субъект тарифа (тимлид/организация). Расход участника команды
относится на бюджет его тимлида; тимлид видит разбивку по участникам.
"""
from datetime import datetime, date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_usage import AiUsageLedger

MICRO = 1_000_000  # микрорублей в рубле

# Пороги мягких уведомлений о квоте (доля использования бюджета).
THRESHOLDS = (0.8, 0.9, 1.0)

# Функции, по которым ведём разбивку (для админ-экономики и отчётов тимлида).
FEATURES = ("pit", "one_ai", "task_decomposition", "meeting_slots", "mood", "development", "other")
FEATURE_LABELS = {
    "pit": "AI-ассистент Пит",
    "one_ai": "ONE AI",
    "task_decomposition": "AI-декомпозиция задач",
    "meeting_slots": "AI-подбор слотов",
    "mood": "Анализ настроения",
    "development": "Развитие",
    "other": "Прочее",
}


def period_str(when: Optional[datetime] = None) -> str:
    when = when or datetime.utcnow()
    return when.strftime("%Y-%m")


def next_period_reset(when: Optional[datetime] = None) -> str:
    """Дата начала следующего расчётного периода (первое число след. месяца)."""
    when = when or datetime.utcnow()
    y, m = when.year, when.month
    y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return date(y, m, 1).isoformat()


# ── стоимость ───────────────────────────────────────────────────────────────

def token_prices() -> tuple[float, float]:
    """(цена_input, цена_output) за 1 млн токенов в рублях — из конфигурации."""
    return (float(settings.ai_price_input_rub_per_mtok or 0),
            float(settings.ai_price_output_rub_per_mtok or 0))


def cost_micro(input_tokens: int, output_tokens: int) -> tuple[int, int]:
    """Стоимость (input_micro, output_micro) в микрорублях по ценам из конфига."""
    p_in, p_out = token_prices()
    in_micro = int(round((input_tokens or 0) / 1_000_000 * p_in * MICRO))
    out_micro = int(round((output_tokens or 0) / 1_000_000 * p_out * MICRO))
    return in_micro, out_micro


# ── владелец бюджета и бюджет ─────────────────────────────────────────────────

def resolve_budget_owner_id(db: Session, user) -> Optional[int]:
    """Кому принадлежит AI-бюджет для этого пользователя: тимлиду его команды,
    а если пользователь сам тимлид или без команды — ему самому."""
    if user is None:
        return None
    try:
        from app.models.team import TeamMember, Team
        # Если пользователь состоит в команде — владелец бюджета её тимлид.
        tm = (db.query(TeamMember)
              .join(Team, Team.id == TeamMember.team_id)
              .filter(TeamMember.user_id == user.id)
              .first())
        if tm:
            team = db.query(Team).filter(Team.id == tm.team_id).first()
            if team and team.team_lead_id:
                return team.team_lead_id
    except Exception:
        pass
    return user.id


def _owner_user(db: Session, owner_id: int):
    from app.models.user import User
    return db.query(User).filter(User.id == owner_id).first()


def budget_rub_for_owner(db: Session, owner_id: int) -> Optional[int]:
    """Эффективный AI-бюджет владельца в рублях. None -> без жёсткого лимита.

    Приоритет: индивидуальный override на подписке -> ai_budget_rub тарифа."""
    from app.services import subscriptions as subs
    from app.services.entitlements import effective_limits
    sub = subs.get_subscription(db, "user", owner_id)
    if sub is not None and sub.ai_budget_rub_override is not None:
        return int(sub.ai_budget_rub_override)
    owner = _owner_user(db, owner_id)
    limits = effective_limits(db, owner)
    val = limits.get("ai_budget_rub")
    return None if val is None else int(val)


# ── запись расхода ────────────────────────────────────────────────────────────

def record_usage(db: Session, *, user, feature: str, input_tokens: int,
                 output_tokens: int, model: Optional[str] = None,
                 team_id: Optional[int] = None, degraded: bool = False) -> AiUsageLedger:
    owner_id = resolve_budget_owner_id(db, user)
    in_micro, out_micro = cost_micro(input_tokens, output_tokens)
    row = AiUsageLedger(
        owner_user_id=owner_id,
        actor_user_id=getattr(user, "id", None),
        team_id=team_id,
        feature=feature if feature in FEATURES else "other",
        input_tokens=int(input_tokens or 0),
        output_tokens=int(output_tokens or 0),
        input_cost_micro=in_micro,
        output_cost_micro=out_micro,
        model=model or settings.ai_gateway_model,
        degraded=1 if degraded else 0,
        period=period_str(),
    )
    db.add(row)
    db.commit()
    return row


# ── агрегаты и состояние квоты ────────────────────────────────────────────────

def usage_summary(db: Session, owner_id: int, period: Optional[str] = None) -> dict:
    """Сводка расхода владельца за период: токены и стоимость (в рублях)."""
    period = period or period_str()
    q = (db.query(
            func.coalesce(func.sum(AiUsageLedger.input_tokens), 0),
            func.coalesce(func.sum(AiUsageLedger.output_tokens), 0),
            func.coalesce(func.sum(AiUsageLedger.input_cost_micro), 0),
            func.coalesce(func.sum(AiUsageLedger.output_cost_micro), 0),
            func.count(AiUsageLedger.id),
         )
         .filter(AiUsageLedger.owner_user_id == owner_id,
                 AiUsageLedger.period == period))
    in_tok, out_tok, in_micro, out_micro, n = q.one()
    return {
        "input_tokens": int(in_tok), "output_tokens": int(out_tok),
        "input_cost_rub": round(int(in_micro) / MICRO, 2),
        "output_cost_rub": round(int(out_micro) / MICRO, 2),
        "total_cost_rub": round((int(in_micro) + int(out_micro)) / MICRO, 2),
        "total_cost_micro": int(in_micro) + int(out_micro),
        "requests": int(n),
    }


def quota_state(db: Session, user) -> dict:
    """Состояние AI-квоты для пользователя (через владельца бюджета).

    degraded=True -> бюджет исчерпан, AI работает в урезанном режиме.
    """
    owner_id = resolve_budget_owner_id(db, user)
    period = period_str()
    summary = usage_summary(db, owner_id, period)
    budget = budget_rub_for_owner(db, owner_id)
    used = summary["total_cost_rub"]
    unlimited = budget is None
    if unlimited:
        percent = 0
        remaining = None
        degraded = False
    else:
        percent = int(round(used / budget * 100)) if budget > 0 else 100
        remaining = round(max(budget - used, 0), 2)
        degraded = used >= budget if budget > 0 else True
    return {
        "owner_user_id": owner_id,
        "period": period,
        "budget_rub": budget,
        "unlimited": unlimited,
        "used_rub": used,
        "remaining_rub": remaining,
        "percent": percent,
        "degraded": degraded,
        "reset_date": next_period_reset(),
        "input_tokens": summary["input_tokens"],
        "output_tokens": summary["output_tokens"],
        "input_cost_rub": summary["input_cost_rub"],
        "output_cost_rub": summary["output_cost_rub"],
        "requests": summary["requests"],
    }


def per_member_breakdown(db: Session, owner_id: int, period: Optional[str] = None) -> list[dict]:
    """Разбивка расхода по участникам (для тимлида): кто сколько потребляет."""
    period = period or period_str()
    rows = (db.query(
                AiUsageLedger.actor_user_id,
                func.coalesce(func.sum(AiUsageLedger.input_tokens), 0),
                func.coalesce(func.sum(AiUsageLedger.output_tokens), 0),
                func.coalesce(func.sum(AiUsageLedger.input_cost_micro + AiUsageLedger.output_cost_micro), 0),
            )
            .filter(AiUsageLedger.owner_user_id == owner_id, AiUsageLedger.period == period)
            .group_by(AiUsageLedger.actor_user_id)
            .all())
    from app.models.user import User
    out = []
    for actor_id, in_tok, out_tok, micro in rows:
        name = None
        if actor_id:
            u = db.query(User).filter(User.id == actor_id).first()
            name = (u.name if u else None) or f"#{actor_id}"
        out.append({
            "user_id": actor_id, "name": name or "—",
            "input_tokens": int(in_tok), "output_tokens": int(out_tok),
            "ai_cost_rub": round(int(micro) / MICRO, 2),
        })
    out.sort(key=lambda r: r["ai_cost_rub"], reverse=True)
    return out


# ── мягкое уведомление о квоте (тот же паттерн, что тарифные уведомления) ──────

def quota_notice(state: dict) -> Optional[dict]:
    """Мягкое уведомление по порогам 80/90/100 (см. 2.4). None — порог не достигнут
    или бюджет безлимитный. Структура совпадает по духу с тарифными уведомлениями
    (code + message), чтобы UI показывал её единообразно, без отдельной ветки."""
    if state.get("unlimited"):
        return None
    pct = state.get("percent", 0)
    if pct >= 100:
        return {"code": "ai_quota", "level": "exhausted", "percent": pct,
                "message": "AI-квота исчерпана. Вы можете дождаться следующего расчётного периода "
                           "или приобрести дополнительную квоту. AI продолжает работать в базовом режиме."}
    if pct >= 90:
        return {"code": "ai_quota", "level": "critical", "percent": pct,
                "message": "Осталось 10% AI-квоты. При достижении лимита AI будет ограничен."}
    if pct >= 80:
        return {"code": "ai_quota", "level": "warning", "percent": pct,
                "message": "Вы использовали 80% AI-квоты."}
    return None


# ── деградация после исчерпания бюджета (2.5) ─────────────────────────────────

def _monthly_revenue_rub(db: Session) -> float:
    """Месячная выручка из активных/пробных ПЛАТНЫХ подписок (для AI Cost/Revenue).
    Годовой тариф приводим к месяцу. Пробные считаем как потенциальную выручку 0
    (деньги ещё не поступили) — берём только active."""
    from app.models.subscription import Subscription
    from app.services.plans import get_plan
    total = 0.0
    subsq = db.query(Subscription).filter(Subscription.status == "active").all()
    for s in subsq:
        plan = get_plan(db, s.plan_code)
        if not plan:
            continue
        if s.billing_period == "year" and plan.price_year:
            total += (plan.price_year or 0) / 12.0
        else:
            total += (plan.price_month or 0)
    return round(total, 2)


def admin_economics(db: Session, period: Optional[str] = None, top: int = 10) -> dict:
    """Раздел «AI Economics» для админ-панели (2.7). Сводка себестоимости AI за
    период: по тарифам, по клиентам, по пользователям, по функциям, а также
    отношение к выручке и валовая маржа после AI."""
    period = period or period_str()
    from app.models.subscription import Subscription

    def rub(micro):
        return round(int(micro or 0) / MICRO, 2)

    base = db.query(AiUsageLedger).filter(AiUsageLedger.period == period)

    agg = (base.with_entities(
                func.coalesce(func.sum(AiUsageLedger.input_tokens), 0),
                func.coalesce(func.sum(AiUsageLedger.output_tokens), 0),
                func.coalesce(func.sum(AiUsageLedger.input_cost_micro), 0),
                func.coalesce(func.sum(AiUsageLedger.output_cost_micro), 0),
                func.count(AiUsageLedger.id),
           ).one())
    in_tok, out_tok, in_micro, out_micro, n_req = agg
    total_micro = int(in_micro) + int(out_micro)
    total_cost = rub(total_micro)

    # По клиентам (владельцам бюджета).
    per_client = (base.with_entities(
                    AiUsageLedger.owner_user_id,
                    func.sum(AiUsageLedger.input_cost_micro + AiUsageLedger.output_cost_micro),
                    func.count(AiUsageLedger.id),
                 ).group_by(AiUsageLedger.owner_user_id).all())
    # По функциям.
    per_feature = (base.with_entities(
                    AiUsageLedger.feature,
                    func.sum(AiUsageLedger.input_cost_micro + AiUsageLedger.output_cost_micro),
                    func.count(AiUsageLedger.id),
                 ).group_by(AiUsageLedger.feature).all())
    # По пользователям (кто фактически расходует).
    per_user = (base.with_entities(
                    AiUsageLedger.actor_user_id,
                    func.sum(AiUsageLedger.input_cost_micro + AiUsageLedger.output_cost_micro),
                 ).group_by(AiUsageLedger.actor_user_id).all())

    # Себестоимость по тарифам: клиент -> его тариф.
    from app.services.plans import get_plan
    by_tier: dict = {}
    n_clients = 0
    for owner_id, micro, _cnt in per_client:
        n_clients += 1
        sub = (db.query(Subscription)
               .filter(Subscription.subject_type == "user", Subscription.subject_id == owner_id)
               .order_by(Subscription.id.desc()).first())
        code = sub.plan_code if sub else "free"
        by_tier[code] = by_tier.get(code, 0) + int(micro)

    from app.models.user import User

    def name_of(uid):
        if not uid:
            return "—"
        u = db.query(User).filter(User.id == uid).first()
        return (u.name if u and u.name else None) or (u.email if u else None) or f"#{uid}"

    top_clients = sorted(
        [{"owner_user_id": oid, "name": name_of(oid), "ai_cost_rub": rub(micro), "requests": int(cnt)}
         for oid, micro, cnt in per_client],
        key=lambda r: r["ai_cost_rub"], reverse=True)[:top]

    top_features = sorted(
        [{"feature": f, "label": FEATURE_LABELS.get(f, f), "ai_cost_rub": rub(micro), "requests": int(cnt)}
         for f, micro, cnt in per_feature],
        key=lambda r: r["ai_cost_rub"], reverse=True)

    revenue = _monthly_revenue_rub(db)
    cost_to_revenue = round(total_cost / revenue * 100, 1) if revenue > 0 else None
    gross_margin = round((revenue - total_cost) / revenue * 100, 1) if revenue > 0 else None

    return {
        "period": period,
        "reset_date": next_period_reset(),
        "prices": {"input_rub_per_mtok": token_prices()[0], "output_rub_per_mtok": token_prices()[1],
                   "model": settings.ai_gateway_model},
        "totals": {
            "input_tokens": int(in_tok), "output_tokens": int(out_tok),
            "input_cost_rub": rub(in_micro), "output_cost_rub": rub(out_micro),
            "total_ai_cost_rub": total_cost, "requests": int(n_req),
            "clients": n_clients,
            "avg_cost_per_request_rub": round(total_cost / int(n_req), 4) if n_req else 0,
            "avg_cost_per_client_rub": round(total_cost / n_clients, 2) if n_clients else 0,
        },
        "revenue": {
            "monthly_revenue_rub": revenue,
            "ai_cost_to_revenue_percent": cost_to_revenue,
            "gross_margin_after_ai_percent": gross_margin,
        },
        "by_tier": [{"plan_code": k, "ai_cost_rub": rub(v)} for k, v in
                    sorted(by_tier.items(), key=lambda kv: kv[1], reverse=True)],
        "top_clients": top_clients,
        "by_feature": top_features,
        "users_count": len([u for u, _ in per_user if u]),
    }


def degraded_plan(db: Session, user) -> dict:
    """Как выполнять запрос с учётом бюджета. Не блокируем AI полностью:
    при исчерпании бюджета переходим на урезанный режим (короче ответ, обрезанный
    контекст), чтобы снизить стоимость, сохранив базовую функциональность."""
    state = quota_state(db, user)
    if state["degraded"]:
        return {"degraded": True, "max_tokens": int(settings.ai_degraded_max_tokens),
                "keep_last_messages": 1}
    return {"degraded": False, "max_tokens": None, "keep_last_messages": None}
