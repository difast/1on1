"""Plan catalog — single source of truth for tariffs (mirrors /pricing).

Сетка (Start / Team / Business / Enterprise) описана ЗДЕСЬ и повторяется
дословно на лендинге (/pricing), в личном кабинете («Мой тариф»), в мобильном
приложении/Mini App и в юридических документах (legal/legal_docs.json).
Любое изменение цены/названия/состава функций начинается с этого файла.

Limits & feature flags are stored in the DB (plans.limits JSON) so they can be
changed from the admin panel without a code deploy. This module defines the
catalog and re-syncs it on startup when CATALOG_VERSION changes (см. seed_plans).

Ключи лимитов (None = без ограничения):
  max_teams   — команд внутри организации
  max_users   — ВСЕГО пользователей в команде, включая тимлида (новый ключ;
                именно он соответствует формулировке «до N пользователей»)
  max_members_per_team — исторический ключ, держим равным max_users для
                совместимости с уже отрисованными экранами
  min_seats, max_meetings_per_month, history_days
Служебные ключи limits:
  public         — показывать ли тариф в публичной сетке (Free — нет: это
                   состояние «нет подписки», а не продаваемый тариф)
  billing_period — "month" | "year" | "contract" (как оплачивается тариф)
  price_label    — что показать вместо цифры для договорных тарифов
  users_label    — человекочитаемый диапазон пользователей для карточек
  catalog_version — версия сетки, по ней seed_plans понимает, что строку в БД
                   нужно пересинхронизировать

Оплата: Start — 1 990 ₽/мес (интервал Month). Team — 4 990 ₽/мес (интервал
Month) ЛИБО 49 990 ₽/год (интервал Year, полной суммой единовременно; выбор
периода делает пользователь при оформлении; годовой = экономия 16,5% против
59 880 ₽ при помесячной оплате). Business — по выбору Заказчика: 9 990 ₽/мес
(интервал Month) ЛИБО 99 990 ₽/год (интервал Year, экономия 16,5% против
119 880 ₽). Enterprise — договорной: автоматической подписки через
CloudPayments нет, только «Связаться с нами» (флаг is_enterprise = «договорной
тариф»).

AI-бюджет (внутренний лимит СЕБЕСТОИМОСТИ AI в рублях, не цена для клиента;
считается по фактической стоимости запросов, см. services/ai_billing.py):
Start — 300 ₽/мес, Team — 1 000 ₽/мес, Business — 2 000 ₽/мес, Enterprise — без
жёсткого лимита (настраивается индивидуально). Значение лежит в limits.ai_budget_rub
и переопределяется на организацию полем subscriptions.ai_budget_rub_override.

Заметки по формулировкам (обязаны совпадать с /pricing и экраном тарифа):
  - "csv_export" — внутреннее имя флага (сохранено ради совместимости с уже
    засеянными строками plans), пользователю показываем «Экспорт данных (Excel)»;
    экспорт реализован в .xlsx.
  - "transcripts" (автотранскрипция встреч) ВРЕМЕННО отключена во всей сетке:
    функция не работает, поэтому везде помечается «Скоро» (COMING_SOON_FEATURES)
    и ни на одном тарифе не выдаётся как активная.
  - Мобильное приложение и База знаний доступны на всех тарифах.
"""
from sqlalchemy.orm import Session
from app.models.plan import Plan

# Версия сетки. Увеличивается при любом изменении состава/цен — по ней
# seed_plans пересинхронизирует строки в БД (иначе прод остался бы на старой
# сетке, т.к. раньше seed никогда не перезаписывал существующие планы).
CATALOG_VERSION = 5

# Полный реестр фич. Порядок = порядок показа в сравнительной таблице.
# Значение — человекочитаемая подпись (используется и в мягких тарифных
# уведомлениях, и на экране «Мой тариф»).
FEATURE_LABELS = {
    # база (Start и выше)
    "one_on_one": "1-на-1 встречи",
    "meeting_proposals": "Предложения встреч",
    "tasks": "Задачи",
    "task_proposals": "Предложения задач",
    "notes": "Заметки",
    "mood_personal": "Личное настроение (чек-ин и личный тренд)",
    "personal_analytics": "Личная аналитика",
    "pit": "AI-ассистент Пит (базовый)",
    "ai_decomposition": "AI-декомпозиция задач",
    "ai_slots": "AI-подбор слотов для встреч",
    "ru_queries": "Запросы на русском",
    "knowledge_base": "База знаний (просмотр)",
    "company_profile": "Профиль компании (поиск по ИНН/БИН)",
    "video_calls": "Созвоны",
    "support": "Поддержка",
    "social_login": "Соц-логины (Yandex ID, VK ID, Telegram), 2FA",
    # Team и выше
    "group_meetings": "Групповые и командные встречи",
    "collab_tasks": "Совместные задачи (несколько исполнителей)",
    "mood": "Командные тренды настроения",
    "risk_alerts": "Сводка тимлиду и алерт о риске",
    "analytics": "Командная аналитика",
    "csv_export": "Экспорт данных (Excel)",
    "goals": "Цели и OKR",
    "development": "Развитие (навыки, планы, рекомендации)",
    "one_ai": "ONE AI",
    # «Управление командой» (не «Админ-панель» — чтобы не путать с внутренней
    # владельческой админкой): раздел тимлида для управления составом команды и
    # просмотра лимитов.
    "admin_panel": "Управление командой",
    "integrations": "Интеграции (Google Calendar, Яндекс Календарь, вебхуки)",
    # Business и выше
    "multi_team": "Несколько команд в организации",
    "one_ai_org": "Расширенный ONE AI (кросс-командная аналитика)",
    "hr_analytics": "HR-аналитика уровня организации",
    "advanced_settings": "Расширенные настройки",
    "time_tracking": "Учёт рабочего времени",
    "dedicated_manager": "Персональный менеджер",
    # Enterprise
    "custom_integrations": "Кастомные интеграции (по запросу)",
    "sso": "SSO / SAML",
    "sla": "SLA",
    "on_premise": "Размещение в контуре заказчика (по договору)",
    # временно недоступно
    "transcripts": "Автотранскрипция встреч",
}

_ALL_FEATURES = list(FEATURE_LABELS.keys())

# Функции, которые есть в описании тарифов, но сейчас НЕ работают: везде
# помечаются «Скоро» и ни на одном тарифе не включаются.
COMING_SOON_FEATURES = ("transcripts",)
COMING_SOON_LABEL = "Скоро"

# Набор фич по тарифам — задаётся накопительно (каждый следующий включает
# предыдущий), чтобы состав нельзя было случайно рассинхронизировать.
_START_FEATURES = [
    "one_on_one", "meeting_proposals", "tasks", "task_proposals", "notes",
    "mood_personal", "personal_analytics", "pit", "ai_decomposition",
    "ai_slots", "ru_queries", "knowledge_base", "company_profile",
    "video_calls", "support", "social_login",
]
_TEAM_FEATURES = _START_FEATURES + [
    "group_meetings", "collab_tasks", "mood", "risk_alerts", "analytics",
    "csv_export", "goals", "development", "one_ai",
    "admin_panel", "integrations",
]
_BUSINESS_FEATURES = _TEAM_FEATURES + [
    "multi_team", "one_ai_org", "hr_analytics", "advanced_settings",
    "time_tracking", "dedicated_manager",
]
_ENTERPRISE_FEATURES = _BUSINESS_FEATURES + [
    "custom_integrations", "sso", "sla", "on_premise",
]


def _features(enabled: list[str]) -> dict:
    """Флаги фич по списку включённых. Всё, чего нет в списке — False.
    Функции из COMING_SOON_FEATURES всегда False (временно не работают)."""
    return {
        k: (k in enabled and k not in COMING_SOON_FEATURES)
        for k in _ALL_FEATURES
    }


# Order matters for display.
PLAN_SEED = [
    {
        # Free — НЕ продаваемый тариф, а состояние «нет активной подписки»
        # (после окончания пробного периода или отмены). В публичной сетке
        # не показывается, но нужен для сценариев 5.5/5.8 (переход на Free).
        "code": "free", "name": "Free",
        "price_month": 0, "price_year": 0, "per_seat": False, "is_enterprise": False,
        "sort_order": 1,
        "limits": {
            "public": False, "billing_period": "none",
            "price_label": "Без подписки", "users_label": "до 3 пользователей",
            "max_teams": 1, "max_users": 3, "max_members_per_team": 3, "min_seats": 1,
            "max_meetings_per_month": 5, "history_days": 14,
            "features": _features([]),
            "support": "email",
            "ai_budget_rub": 0,
        },
    },
    {
        "code": "start", "name": "Start",
        "price_month": 1990, "price_year": 0, "per_seat": False, "is_enterprise": False,
        "sort_order": 2,
        "limits": {
            "public": True, "billing_period": "month",
            "price_label": "1 990 ₽/мес", "users_label": "до 8 пользователей",
            "max_teams": 1, "max_users": 8, "max_members_per_team": 8, "min_seats": 1,
            "max_meetings_per_month": None, "history_days": None,
            "trial_days": 14, "trial_restricted_features": [],
            "features": _features(_START_FEATURES),
            "support": "email",
            "ai_budget_rub": 300,
        },
    },
    {
        # Team — единственный тариф с ВЫБОРОМ периода: помесячно (4 990 ₽/мес)
        # или годовой (49 990 ₽/год, экономия 16,5% против 59 880 ₽). price_month
        # и price_year заданы оба; период выбирает пользователь при оформлении.
        "code": "team", "name": "Team",
        "price_month": 4990, "price_year": 49990, "per_seat": False, "is_enterprise": False,
        "sort_order": 3,
        "limits": {
            "public": True, "billing_period": "month",
            "price_label": "4 990 ₽/мес", "price_label_year": "49 990 ₽/год",
            "year_discount_percent": 16.5, "users_label": "до 30 пользователей",
            "max_teams": 1, "max_users": 30, "max_members_per_team": 30, "min_seats": 1,
            "max_meetings_per_month": None, "history_days": None,
            # Пробный период Team — ограниченный: ONE AI и Развитие на триале
            # недоступны (мягкое тарифное уведомление, тот же механизм).
            "trial_days": 14, "trial_restricted_features": ["one_ai", "development"],
            "features": _features(_TEAM_FEATURES),
            "support": "email",
            "ai_budget_rub": 1000,
        },
    },
    {
        # Business — самостоятельная оплата, теперь с ВЫБОРОМ периода как у Team:
        # 9 990 ₽/мес либо 99 990 ₽/год (экономия 16,5% против 119 880 ₽).
        # price_month и price_year заданы оба -> offers_period_choice=True ->
        # переключатель месяц/год работает и для Business. is_enterprise=False.
        "code": "business", "name": "Business",
        "price_month": 9990, "price_year": 99990, "per_seat": False, "is_enterprise": False,
        "sort_order": 4,
        "limits": {
            "public": True, "billing_period": "month",
            "price_label": "9 990 ₽/мес", "price_label_year": "99 990 ₽/год",
            "year_discount_percent": 16.5, "users_label": "до 80 пользователей",
            "max_teams": None, "max_users": 80, "max_members_per_team": 80, "min_seats": 1,
            "max_meetings_per_month": None, "history_days": None,
            "trial_days": 14, "trial_restricted_features": [],
            "features": _features(_BUSINESS_FEATURES),
            "support": "priority",
            "ai_budget_rub": 2000,
        },
    },
    {
        "code": "enterprise", "name": "Enterprise",
        "price_month": 0, "price_year": 0, "per_seat": False, "is_enterprise": True,
        "sort_order": 5,
        "limits": {
            "public": True, "billing_period": "contract",
            "price_label": "Цена по запросу",
            "users_label": "без ограничений",
            "max_teams": None, "max_users": None, "max_members_per_team": None, "min_seats": 30,
            "max_meetings_per_month": None, "history_days": None,
            "features": _features(_ENTERPRISE_FEATURES),
            "support": "24/7",
            # None = без жёсткого лимита; фактический лимит для конкретной
            # организации задаётся индивидуально (ai_budget_rub_override).
            "ai_budget_rub": None,
        },
    },
]

# Старые коды тарифов -> новые. Нужен, чтобы уже оформленные подписки на
# «Компания» продолжали работать после смены сетки (миграция 038 переписывает
# строки в БД, а это — страховка на уровне кода).
LEGACY_PLAN_CODES = {"company": "business"}

# Лимиты, когда пробный период истёк, а enforcement включён: доступ к платным
# функциям закрыт, нужно выбрать тариф. (Пока ENTITLEMENTS_ENFORCE=off — не
# применяется.)
LOCKED_LIMITS = {
    "max_teams": 0, "max_users": 0, "max_members_per_team": 0, "min_seats": 1,
    "max_meetings_per_month": 0, "history_days": 0,
    "features": {k: False for k in _ALL_FEATURES},
    "support": "email",
    "ai_budget_rub": 0,
}

# Limits granted when an account is flagged with full access (no subscription).
UNLIMITED_LIMITS = {
    "max_teams": None, "max_users": None, "max_members_per_team": None, "min_seats": 1,
    "max_meetings_per_month": None, "history_days": None,
    # Даже при полном доступе неработающая функция остаётся выключенной.
    "features": {k: k not in COMING_SOON_FEATURES for k in _ALL_FEATURES},
    "support": "24/7",
    "ai_budget_rub": None,
}


def plan_seed(code: str) -> dict | None:
    for p in PLAN_SEED:
        if p["code"] == code:
            return p
    return None


def min_plan_for_feature(feature: str) -> dict | None:
    """Минимальный ПУБЛИЧНЫЙ тариф, на котором функция доступна.

    Используется мягкими тарифными уведомлениями, чтобы писать конкретно
    («доступна на тарифе Team»), а не общую формулировку.
    """
    for p in PLAN_SEED:
        if not p["limits"].get("public"):
            continue
        if p["limits"]["features"].get(feature):
            return {"code": p["code"], "name": p["name"]}
    return None


def public_plans() -> list[dict]:
    return [p for p in PLAN_SEED if p["limits"].get("public")]


def seed_plans(db: Session) -> None:
    """Идемпотентно синхронизирует каталог тарифов с PLAN_SEED.

    Строка в БД обновляется, если её catalog_version отличается от текущей —
    так смена сетки доезжает до прода без ручных правок. Внутри одной версии
    правки из админ-панели не затираются.
    """
    seen = set()
    for p in PLAN_SEED:
        limits = dict(p["limits"])
        limits["catalog_version"] = CATALOG_VERSION
        seen.add(p["code"])
        existing = db.query(Plan).filter(Plan.code == p["code"]).first()
        if existing is None:
            db.add(Plan(
                code=p["code"], name=p["name"], price_month=p["price_month"],
                price_year=p["price_year"], per_seat=p["per_seat"],
                is_enterprise=p["is_enterprise"], sort_order=p["sort_order"],
                limits=limits, is_active=True, currency="RUB",
            ))
            continue
        if (existing.limits or {}).get("catalog_version") == CATALOG_VERSION:
            continue
        existing.name = p["name"]
        existing.price_month = p["price_month"]
        existing.price_year = p["price_year"]
        existing.per_seat = p["per_seat"]
        existing.is_enterprise = p["is_enterprise"]
        existing.sort_order = p["sort_order"]
        existing.limits = limits
        existing.is_active = True

    # Тарифы, которых больше нет в каталоге (например «Компания»), убираем из
    # витрины, но строку сохраняем — на неё могут ссылаться старые платежи.
    for old in db.query(Plan).filter(Plan.is_active == True).all():  # noqa: E712
        if old.code not in seen:
            old.is_active = False
    db.commit()


def list_plans(db: Session):
    return db.query(Plan).filter(Plan.is_active == True).order_by(Plan.sort_order).all()  # noqa: E712


def get_plan(db: Session, code: str):
    code = LEGACY_PLAN_CODES.get(code, code)
    return db.query(Plan).filter(Plan.code == code).first()
