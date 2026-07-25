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
from app.services.plans import (
    UNLIMITED_LIMITS, LOCKED_LIMITS, COMING_SOON_FEATURES, COMING_SOON_LABEL,
    FEATURE_LABELS, LEGACY_PLAN_CODES, get_plan, min_plan_for_feature,
)


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
            return LEGACY_PLAN_CODES.get(code, code)
    except Exception:
        pass
    return "free"


def trial_restrictions(db: Session, user) -> list[str]:
    """Функции, закрытые НА ВРЕМЯ пробного периода текущего тарифа.

    Отдельного механизма для триала нет: ограничение выражается теми же
    флагами фич, поэтому дальше работает обычный require_feature.
    Сейчас это Team: ONE AI и Развитие на 14-дневном триале недоступны.
    """
    if user is None:
        return []
    try:
        from app.services import subscriptions as subs
        sub = subs.get_subscription(db, "user", user.id)
    except Exception:
        return []
    if not sub or sub.status != "trialing":
        return []
    if sub.trial_end and sub.trial_end <= datetime.utcnow():
        return []
    plan = get_plan(db, sub.plan_code)
    if plan is None:
        return []
    return list((plan.limits or {}).get("trial_restricted_features") or [])


def effective_limits(db: Session, user) -> dict:
    code = resolve_plan_code(db, user)
    if code == "__unlimited__":
        return dict(UNLIMITED_LIMITS)
    # Пробный период (14 дней) истёк и enforcement включён — доступ заблокирован
    # до выбора тарифа. Без enforcement лимиты обычные (Free).
    if code == "free" and entitlements_enforced():
        try:
            from app.services.subscriptions import access_window
            if access_window(db, user).get("expired"):
                return dict(LOCKED_LIMITS)
        except Exception:
            pass
    p = get_plan(db, code) or get_plan(db, "free")
    limits = dict(p.limits) if p else {}
    if not limits:
        return limits

    restricted = trial_restrictions(db, user)
    if restricted:
        features = dict(limits.get("features") or {})
        for f in restricted:
            features[f] = False
        limits["features"] = features
        limits["trial_restricted_features"] = restricted
    return limits


def feature_enabled(limits: dict, feature: str) -> bool:
    return bool((limits.get("features") or {}).get(feature, False))


# Человекочитаемые названия функций живут в каталоге тарифов (plans.py), чтобы
# подпись в уведомлении, на экране «Мой тариф» и на лендинге была одна и та же.


def feature_lock(db: Session, user, feature: str) -> dict | None:
    """Вернуть структуру мягкого тарифного уведомления, если функция недоступна
    на тарифе пользователя (и включён enforcement). Иначе None — функция доступна.

    Возвращаемая структура становится detail у HTTP 402 и распознаётся фронтом,
    чтобы показать понятное сообщение с ссылкой на тарифы, а не техническую ошибку.

    Три причины недоступности, все — с одним и тем же кодом feature_locked,
    чтобы UI не заводил отдельных веток:
      1. функция временно не работает (COMING_SOON_FEATURES) — «Скоро»;
      2. функция закрыта на время пробного периода (Team: ONE AI, Развитие);
      3. функция доступна начиная с более старшего тарифа — называем его явно.
    """
    if user is None or not entitlements_enforced():
        return None
    limits = effective_limits(db, user)
    if feature_enabled(limits, feature):
        return None
    label = FEATURE_LABELS.get(feature, "Эта функция")

    if feature in COMING_SOON_FEATURES:
        return {
            "code": "feature_locked", "feature": feature, "feature_label": label,
            "coming_soon": True, "min_plan": None, "min_plan_name": None,
            "message": f"Функция «{label}» пока недоступна — {COMING_SOON_LABEL.lower()}.",
        }

    if feature in (limits.get("trial_restricted_features") or []):
        plan_code = resolve_plan_code(db, user)
        plan = get_plan(db, plan_code)
        plan_name = plan.name if plan else plan_code
        return {
            "code": "feature_locked", "feature": feature, "feature_label": label,
            "trial_locked": True, "min_plan": plan_code, "min_plan_name": plan_name,
            "message": f"Функция «{label}» недоступна во время пробного периода. "
                       f"Оформите подписку {plan_name}, чтобы включить её.",
        }

    mp = min_plan_for_feature(feature)
    if mp:
        return {
            "code": "feature_locked", "feature": feature, "feature_label": label,
            "min_plan": mp["code"], "min_plan_name": mp["name"],
            "message": f"Функция «{label}» доступна на тарифе {mp['name']}. "
                       f"Повысьте тариф, чтобы использовать её.",
        }
    return {
        "code": "feature_locked", "feature": feature, "feature_label": label,
        "min_plan": None, "min_plan_name": None,
        "message": f"Функция «{label}» доступна на другом тарифе. "
                   f"Повысьте тариф, чтобы использовать её.",
    }


def require_feature(db: Session, user, feature: str) -> None:
    """Бросить HTTP 402 со структурированным detail, если функция недоступна по
    тарифу. No-op, пока enforcement выключен или функция доступна."""
    lock = feature_lock(db, user, feature)
    if lock is not None:
        from fastapi import HTTPException
        raise HTTPException(status_code=402, detail=lock)


# ---- enforcement: проверки лимитов при создании сущностей ------------------
# Все функции — no-op, пока ENTITLEMENTS_ENFORCE выключен (возвращают None).
# Возвращают текст ошибки (для HTTP 402) либо None, если создавать можно.

UPGRADE_HINT = " Повысьте тариф в разделе «Мой тариф»."


def team_limit_error(db: Session, user) -> str | None:
    if user is None or not entitlements_enforced():
        return None
    maxt = limit_value(effective_limits(db, user), "max_teams")
    if maxt is None:
        return None
    from app.models.team import Team
    count = db.query(Team).filter(Team.team_lead_id == user.id).count()
    if count >= maxt:
        return f"Достигнут лимит команд для вашего тарифа ({maxt}). Сейчас у вас {count}." + UPGRADE_HINT
    return None


def member_limit_error(db: Session, team) -> str | None:
    """team — объект Team; тариф берём у тимлида команды.

    Считаем ВСЕХ пользователей команды, включая тимлида: в новой сетке лимит
    сформулирован как «до N пользователей» (Start — 5, Team — 30), а не «плюс
    тимлид». Ключ max_users; max_members_per_team остаётся запасным для строк,
    засеянных до смены сетки.
    """
    if team is None or not entitlements_enforced():
        return None
    from app.models.user import User
    from app.models.team import TeamMember
    lead = db.query(User).filter(User.id == team.team_lead_id).first()
    limits = effective_limits(db, lead)
    maxm = limit_value(limits, "max_users")
    if maxm is None:
        maxm = limit_value(limits, "max_members_per_team")
    if maxm is None:
        return None
    count = db.query(TeamMember).filter(TeamMember.team_id == team.id).count()
    if count >= maxm:
        return f"Достигнут лимит пользователей команды для тарифа ({maxm})." + UPGRADE_HINT
    return None


def meeting_limit_error(db: Session, user) -> str | None:
    """Лимит встреч в календарном месяце (по дате создания записи)."""
    if user is None or not entitlements_enforced():
        return None
    maxmeet = limit_value(effective_limits(db, user), "max_meetings_per_month")
    if maxmeet is None:
        return None
    from app.models.meeting import Meeting
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = db.query(Meeting).filter(
        Meeting.team_lead_id == user.id, Meeting.created_at >= start
    ).count()
    if count >= maxmeet:
        return f"Достигнут лимит встреч в этом месяце для вашего тарифа ({maxmeet})." + UPGRADE_HINT
    return None


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
