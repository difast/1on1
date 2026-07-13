"""Plan catalog — single source of truth for tariffs (mirrors /pricing).

Limits & feature flags are stored in the DB (plans.limits JSON) so they can be
changed from the admin panel without a code deploy. This module defines the
initial seed and keeps it idempotently in sync on startup.

Limit keys (None = unlimited):
  max_teams, max_members_per_team, min_seats, max_meetings_per_month, history_days
Feature flags (bool): pit, ai_slots, ru_queries, ai_decomposition, mood,
  analytics, risk_alerts, csv_export, video_calls, transcripts, time_tracking,
  sso, on_premise, dedicated_manager
support: "email" | "priority" | "24/7"

Notes on wording (must match /pricing and the in-app plan screen):
  - "csv_export" is the internal flag name kept for DB compatibility, but the
    user-facing label is "Экспорт данных (Excel)" — экспорт реализован в .xlsx,
    CSV не поддерживается. Ключ не переименовываем, чтобы не расходиться с уже
    засеянными строками plans в проде (seed их не перезаписывает).
  - "transcripts" — транскрипт формируется по загруженной записи встречи;
    label: "Транскрипты встреч (по записи)".
  - Мобильное приложение и База знаний доступны на всех тарифах (общие функции
    платформы), поэтому отдельными флагами тарифа не гейтятся.
  - Тариф Free ограничен по времени: при регистрации создаётся 14-дневное окно
    (subscriptions.start_free_window). После истечения, при включённом
    ENTITLEMENTS_ENFORCE, доступ закрывается до выбора тарифа (LOCKED_LIMITS).
"""
from sqlalchemy.orm import Session
from app.models.plan import Plan

# Order matters for display.
PLAN_SEED = [
    {
        "code": "free", "name": "Free",
        "price_month": 0, "price_year": 0, "per_seat": False, "is_enterprise": False,
        "sort_order": 1,
        "limits": {
            "max_teams": 1, "max_members_per_team": 3, "min_seats": 1,
            "max_meetings_per_month": 5, "history_days": 14,
            "features": {
                "pit": False, "ai_slots": False, "ru_queries": False,
                "ai_decomposition": False, "mood": False, "analytics": False,
                "risk_alerts": False, "csv_export": False, "video_calls": False,
                "transcripts": False, "time_tracking": False, "sso": False,
                "on_premise": False, "dedicated_manager": False,
            },
            "support": "email",
        },
    },
    {
        "code": "start", "name": "Старт",
        "price_month": 1490, "price_year": 1192, "per_seat": False, "is_enterprise": False,
        "sort_order": 2,
        "limits": {
            "max_teams": 1, "max_members_per_team": 10, "min_seats": 1,
            "max_meetings_per_month": None, "history_days": None,
            "features": {
                "pit": True, "ai_slots": True, "ru_queries": True,
                "ai_decomposition": False, "mood": False, "analytics": False,
                "risk_alerts": False, "csv_export": False, "video_calls": False,
                "transcripts": False, "time_tracking": False, "sso": False,
                "on_premise": False, "dedicated_manager": False,
            },
            "support": "email",
        },
    },
    {
        "code": "team", "name": "Команда",
        "price_month": 490, "price_year": 392, "per_seat": True, "is_enterprise": False,
        "sort_order": 3,
        "limits": {
            "max_teams": 5, "max_members_per_team": 25, "min_seats": 5,
            "max_meetings_per_month": None, "history_days": None,
            "features": {
                "pit": True, "ai_slots": True, "ru_queries": True,
                "ai_decomposition": True, "mood": True, "analytics": True,
                "risk_alerts": True, "csv_export": True, "video_calls": False,
                "transcripts": False, "time_tracking": False, "sso": False,
                "on_premise": False, "dedicated_manager": False,
            },
            "support": "email",
        },
    },
    {
        "code": "company", "name": "Компания",
        "price_month": 349, "price_year": 279, "per_seat": True, "is_enterprise": False,
        "sort_order": 4,
        "limits": {
            "max_teams": 15, "max_members_per_team": 100, "min_seats": 25,
            "max_meetings_per_month": None, "history_days": None,
            "features": {
                "pit": True, "ai_slots": True, "ru_queries": True,
                "ai_decomposition": True, "mood": True, "analytics": True,
                "risk_alerts": True, "csv_export": True, "video_calls": True,
                "transcripts": True, "time_tracking": True, "sso": False,
                "on_premise": False, "dedicated_manager": False,
            },
            "support": "priority",
        },
    },
    {
        "code": "enterprise", "name": "Enterprise",
        "price_month": 0, "price_year": 0, "per_seat": True, "is_enterprise": True,
        "sort_order": 5,
        "limits": {
            "max_teams": None, "max_members_per_team": None, "min_seats": 1,
            "max_meetings_per_month": None, "history_days": None,
            "features": {
                "pit": True, "ai_slots": True, "ru_queries": True,
                "ai_decomposition": True, "mood": True, "analytics": True,
                "risk_alerts": True, "csv_export": True, "video_calls": True,
                "transcripts": True, "time_tracking": True, "sso": True,
                "on_premise": True, "dedicated_manager": True,
            },
            "support": "24/7",
        },
    },
]

_ALL_FEATURES = [
    "pit", "ai_slots", "ru_queries", "ai_decomposition", "mood", "analytics",
    "risk_alerts", "csv_export", "video_calls", "transcripts", "time_tracking",
    "sso", "on_premise", "dedicated_manager",
]

# Лимиты, когда 14-дневное окно Free истекло, а enforcement включён: доступ к
# платным функциям закрыт, нужно выбрать тариф. (Пока ENTITLEMENTS_ENFORCE=off —
# не применяется.)
LOCKED_LIMITS = {
    "max_teams": 0, "max_members_per_team": 0, "min_seats": 1,
    "max_meetings_per_month": 0, "history_days": 0,
    "features": {k: False for k in _ALL_FEATURES},
    "support": "email",
}

# Limits granted when an account is flagged with full access (no subscription).
UNLIMITED_LIMITS = {
    "max_teams": None, "max_members_per_team": None, "min_seats": 1,
    "max_meetings_per_month": None, "history_days": None,
    "features": {k: True for k in [
        "pit", "ai_slots", "ru_queries", "ai_decomposition", "mood", "analytics",
        "risk_alerts", "csv_export", "video_calls", "transcripts", "time_tracking",
        "sso", "on_premise", "dedicated_manager",
    ]},
    "support": "24/7",
}


def seed_plans(db: Session) -> None:
    """Idempotently ensure all catalog plans exist (create missing ones).

    Existing plans are NOT overwritten — once live, prices/limits are managed
    from the admin panel, so we never clobber admin edits on restart.
    """
    for p in PLAN_SEED:
        existing = db.query(Plan).filter(Plan.code == p["code"]).first()
        if existing:
            continue
        db.add(Plan(
            code=p["code"], name=p["name"], price_month=p["price_month"],
            price_year=p["price_year"], per_seat=p["per_seat"],
            is_enterprise=p["is_enterprise"], sort_order=p["sort_order"],
            limits=p["limits"], is_active=True, currency="RUB",
        ))
    db.commit()


def list_plans(db: Session):
    return db.query(Plan).filter(Plan.is_active == True).order_by(Plan.sort_order).all()  # noqa: E712


def get_plan(db: Session, code: str):
    return db.query(Plan).filter(Plan.code == code).first()
