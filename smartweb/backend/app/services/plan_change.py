"""Единая логика смены тарифа — один источник правды для лендинга и ЛК.

ЗАЧЕМ отдельный сервис: и вход с лендинга (?upgrade=1&plan=team), и клик
"Перейти на тариф" внутри личного кабинета должны проходить ОДНИ и те же
проверки (уже на этом тарифе / апгрейд / даунгрейд / переход на Free /
Enterprise / grace-period), чтобы не дублировать правила в двух местах.

`decide()` — ЧИСТАЯ функция без побочных эффектов: она только СООБЩАЕТ, что
произойдёт (какой сценарий и что показать пользователю). Реальные мутации
(оплата через виджет, отмена, даунгрейд) выполняют отдельные эндпоинты/webhook,
опираясь на это решение. Так UI лендинга и ЛК рисуют одинаковые подтверждения.

Сценарии соответствуют Этапу 5 (5.2–5.5, 5.7, 5.8):
  register        — пользователь не определён (лендинг → регистрация; 5.1/5.6)
  contact_sales   — Enterprise, биллинг не запускается (5.7)
  already_on_plan — уже на этом тарифе (5.2)
  fix_payment     — тот же тариф, но подписка в grace-period (5.8, тот же тариф)
  fix_payment_first — другой тариф поверх непогашенной подписки запрещён (5.8)
  upgrade         — дороже текущего, действует сразу, доплата разницы (5.3)
  downgrade       — дешевле текущего, с начала следующего периода (5.4)
  downgrade_free  — переход на Free = даунгрейд + отмена автосписаний (5.5)
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.services.plans import get_plan, list_plans
from app.services.entitlements import resolve_plan_code, get_usage
from app.services import subscriptions as subs

GRACE_STATES = ("past_due",)


def _rank_map(db: Session) -> dict:
    return {p.code: p.sort_order for p in list_plans(db)}


def _charge_month(plan, period: str, seats: int) -> int:
    """Месячный эквивалент цены тарифа в рублях (для сравнения и показа доплаты)."""
    base = plan.price_year if period == "year" else plan.price_month
    if plan.per_seat:
        base = base * max(seats, 1)
    return int(base)


def _overlimit_violations(db: Session, user, target_plan) -> list[dict]:
    """Что из текущего использования не влезает в лимиты целевого (более дешёвого)
    тарифа. Только чтение. Возвращает понятные строки для предупреждения (5.4)."""
    from app.models.team import Team, TeamMember  # локальный импорт: избегаем циклов
    out = []
    lim = target_plan.limits or {}

    max_teams = lim.get("max_teams")
    if max_teams is not None:
        teams = db.query(Team).filter(Team.team_lead_id == user.id).all()
        if len(teams) > max_teams:
            out.append({"key": "teams",
                        "message": f"Сейчас у вас команд: {len(teams)}, а новый тариф допускает {max_teams}. "
                                   f"Лишние команды нужно будет удалить или объединить."})
        max_members = lim.get("max_members_per_team")
        if max_members is not None and teams:
            worst = 0
            for t in teams:
                c = db.query(TeamMember).filter(TeamMember.team_id == t.id).count()
                worst = max(worst, c)
            if worst > max_members:
                out.append({"key": "members",
                            "message": f"В одной из команд участников: {worst}, лимит нового тарифа — {max_members}. "
                                       f"Лишних участников нужно будет убрать."})

    max_meet = lim.get("max_meetings_per_month")
    if max_meet is not None:
        used = get_usage(db, "user", user.id, "meetings")
        if used > max_meet:
            out.append({"key": "meetings",
                        "message": f"В этом месяце проведено встреч: {used}, лимит нового тарифа — {max_meet}."})
    return out


def decide(db: Session, user, target_code: str, period: str = "month", seats: int = 1) -> dict:
    """Единственная точка принятия решения. Ничего не меняет."""
    target = get_plan(db, target_code)
    if target is None:
        return {"action": "error", "message": "Неизвестный тариф."}

    # Enterprise — только через продажи, биллинг не запускаем (5.7).
    if target.is_enterprise:
        return {"action": "contact_sales", "plan": target.code,
                "message": "Тариф Enterprise подключается индивидуально. Напишите нам, и мы всё настроим."}

    # Нет пользователя — путь регистрации (для лендинга; 5.1/5.6).
    if user is None:
        return {"action": "register", "plan": target.code, "period": period,
                "requires_payment": target.code != "free"}

    ranks = _rank_map(db)
    current_code = resolve_plan_code(db, user)
    if current_code == "__unlimited__":
        return {"action": "already_on_plan", "plan": target.code,
                "message": "У вашего аккаунта полный доступ — менять тариф не требуется."}

    sub = subs.get_subscription(db, "user", user.id)
    in_grace = bool(sub and sub.status in GRACE_STATES)
    # В grace-периоде resolve_plan_code уже вернул бы Free, но фактически
    # пользователь ещё «на своём» платном тарифе (доступ сохраняется до решения
    # проблемы с оплатой), поэтому для сравнения берём план из подписки.
    if in_grace and sub:
        current_code = sub.plan_code

    # Тот же тариф.
    if target.code == current_code:
        if in_grace:
            return {"action": "fix_payment", "plan": target.code,
                    "message": "По текущей подписке не прошёл платёж. Обновите карту, чтобы продлить доступ — "
                               "новая подписка не создаётся."}
        return {"action": "already_on_plan", "plan": target.code,
                "message": "Этот тариф уже подключён."}

    # Любая смена тарифа поверх непогашенной подписки запрещена (5.8, другой тариф).
    if in_grace:
        return {"action": "fix_payment_first", "plan": target.code,
                "message": "Сначала нужно решить проблему с оплатой текущей подписки (обновить карту), "
                           "и только потом менять тариф. Вторая подписка поверх непогашенной не создаётся."}

    cur_rank = ranks.get(current_code, 1)
    tgt_rank = ranks.get(target.code, 1)

    # Переход на Free = даунгрейд + отмена автосписаний (5.5).
    if target.code == "free":
        return {"action": "downgrade_free", "plan": "free",
                "effective": "period_end",
                "period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
                "message": "Переход на Free отменит автосписания. Платные функции сохранятся до конца "
                           "оплаченного периода, затем аккаунт перейдёт на Free."}

    if tgt_rank > cur_rank:
        # Апгрейд — новые лимиты сразу, доплата разницы (5.3).
        cur_plan = get_plan(db, current_code)
        cur_m = _charge_month(cur_plan, period, seats) if cur_plan else 0
        tgt_m = _charge_month(target, period, seats)
        return {"action": "upgrade", "plan": target.code, "period": period, "seats": seats,
                "immediate": True,
                "current_month_price": cur_m, "target_month_price": tgt_m,
                "diff_month": max(tgt_m - cur_m, 0),
                "message": "Новые лимиты станут доступны сразу. Спишется разница за текущий период, "
                           "далее подписка продлевается по цене нового тарифа."}

    # Даунгрейд на более дешёвый платный — с начала следующего периода (5.4).
    return {"action": "downgrade", "plan": target.code, "period": period, "seats": seats,
            "effective": "period_end",
            "period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
            "over_limit": _overlimit_violations(db, user, target),
            "message": "Понижение вступит в силу с начала следующего расчётного периода. "
                       "До этого момента текущие лимиты сохраняются."}
