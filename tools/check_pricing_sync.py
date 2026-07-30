#!/usr/bin/env python3
"""Сверка тарифной сетки во всех местах, где она упоминается.

Источник правды — smartweb/backend/app/services/plans.py. Скрипт проверяет, что
названия, цены и лимиты пользователей дословно совпадают с тем, что показывают:
  - лендинг: landing/pricing.html (карточки, сравнительная таблица, калькулятор)
  - личный кабинет: экран «Мой тариф» берёт данные из API, но текст-хиро с
    ценами зашит — проверяем и его
  - мобильное приложение: запасные подписи в TariffScreen.tsx
  - юридические документы: legal/legal_docs.json (соглашение и оферта)

Запуск:  python3 tools/check_pricing_sync.py
Код возврата 1, если найдено расхождение.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def load_catalog():
    sys.path.insert(0, os.path.join(ROOT, "smartweb/backend"))
    os.environ.setdefault("DATABASE_URL", "sqlite://")
    src = read("smartweb/backend/app/services/plans.py")
    # plans.py импортирует SQLAlchemy-модель; для сверки достаточно самих данных,
    # поэтому исполняем модуль без строк с импортами приложения.
    body = "\n".join(
        line for line in src.splitlines()
        if not line.startswith("from sqlalchemy") and not line.startswith("from app.")
    )
    ns = {"Session": object, "Plan": object}
    exec(compile(body, "plans.py", "exec"), ns)
    return ns


def main():
    cat = load_catalog()
    plans = {p["code"]: p for p in cat["PLAN_SEED"]}
    problems = []

    def expect(condition, message):
        if not condition:
            problems.append(message)

    # ── 1. Цены и лимиты каталога — то, от чего пляшут остальные проверки ────
    expected = {
        "start": ("Start", 1490, 0, "month", 5, 1, "1 490 ₽/мес"),
        "team": ("Team", 0, 49990, "year", 30, 1, "49 990 ₽/год"),
        "business": ("Business", 0, 0, "contract", None, None, "Цена договорная"),
        "enterprise": ("Enterprise", 0, 0, "contract", None, None,
                       "Цена по запросу"),
    }
    for code, (name, pm, py, period, users, teams, label) in expected.items():
        p = plans.get(code)
        if p is None:
            problems.append(f"plans.py: нет тарифа {code}")
            continue
        lim = p["limits"]
        expect(p["name"] == name, f"plans.py: имя {code} = {p['name']}, ожидалось {name}")
        expect(p["price_month"] == pm, f"plans.py: price_month {code} = {p['price_month']}, ожидалось {pm}")
        expect(p["price_year"] == py, f"plans.py: price_year {code} = {p['price_year']}, ожидалось {py}")
        expect(lim["billing_period"] == period, f"plans.py: период {code} = {lim['billing_period']}, ожидалось {period}")
        expect(lim["max_users"] == users, f"plans.py: max_users {code} = {lim['max_users']}, ожидалось {users}")
        expect(lim["max_teams"] == teams, f"plans.py: max_teams {code} = {lim['max_teams']}, ожидалось {teams}")
        expect(lim["price_label"] == label, f"plans.py: price_label {code} = {lim['price_label']}, ожидалось {label}")
        expect(lim["max_users"] == lim["max_members_per_team"],
               f"plans.py: max_users и max_members_per_team у {code} разошлись")

    # Договорные тарифы не должны продаваться самообслуживанием.
    for code in ("business", "enterprise"):
        expect(plans[code]["is_enterprise"] is True,
               f"plans.py: {code} должен быть договорным (is_enterprise=True), иначе включится оплата картой")
    for code in ("start", "team"):
        expect(plans[code]["is_enterprise"] is False, f"plans.py: {code} не договорной тариф")
        expect(plans[code]["per_seat"] is False, f"plans.py: {code} не должен считаться за место (per_seat)")

    # Автотранскрипция нигде не включена.
    for code, p in plans.items():
        expect(p["limits"]["features"].get("transcripts") is False,
               f"plans.py: автотранскрипция включена на тарифе {code}, а функция временно не работает")

    # Ограничение пробного периода Team.
    expect(plans["team"]["limits"]["trial_restricted_features"] == ["one_ai", "development"],
           "plans.py: на триале Team должны быть закрыты ровно ONE AI и Развитие")
    expect(plans["start"]["limits"]["trial_restricted_features"] == [],
           "plans.py: пробный период Start — полный доступ к функциям тарифа")

    # ── 2. Минимальные тарифы для ключевых функций ──────────────────────────
    min_plan = cat["min_plan_for_feature"]
    for feature, plan_name in {
        "pit": "Start", "personal_analytics": "Start", "mood_personal": "Start",
        "knowledge_base": "Start", "company_profile": "Start",
        "group_meetings": "Team", "collab_tasks": "Team", "analytics": "Team",
        "goals": "Team", "development": "Team", "one_ai": "Team",
        "csv_export": "Team", "admin_panel": "Team", "mood": "Team",
        "risk_alerts": "Team", "ai_decomposition": "Team",
        "multi_team": "Business", "one_ai_org": "Business", "hr_analytics": "Business",
        "sso": "Enterprise", "sla": "Enterprise", "custom_integrations": "Enterprise",
    }.items():
        got = min_plan(feature)
        expect(got and got["name"] == plan_name,
               f"plans.py: {feature} доступна с {got and got['name']}, ожидалось {plan_name}")
    expect(min_plan("transcripts") is None,
           "plans.py: автотранскрипция не должна иметь минимального тарифа — она помечена как Скоро")

    # ── 3. Лендинг ──────────────────────────────────────────────────────────
    pricing = read("landing/pricing.html")
    for needle in ("1 490₽", "49 990₽", "Цена договорная", "Цена по запросу",
                   "До <strong>5</strong> пользователей", "До <strong>30</strong> пользователей",
                   "30–100+</strong> пользователей"):
        expect(needle in pricing, f"landing/pricing.html: не найдено «{needle}»")
    # Проверяем именно витринные строки старой сетки, а не любое вхождение цифр:
    # «1 490₽» законно содержит «490₽», а комментарий про Lattice — «₽/чел·мес».
    for stale in ('<span class="monthly">490₽</span>', '349₽', '1 млн', '1 000 000',
                  '<small> /чел·мес</small>', '>Компания</div>', '>Старт</div>'):
        expect(stale not in pricing, f"landing/pricing.html: осталась старая сетка — «{stale}»")
    expect(pricing.count("Скоро") >= 4 or pricing.count("скоро") >= 4,
           "landing/pricing.html: автотранскрипция должна быть помечена «Скоро» во всех тарифах")
    expect("49990" in pricing, "landing/pricing.html: калькулятор не знает годовую цену Team")
    expect("perPerson:" not in pricing and "unit * people" not in pricing,
           "landing/pricing.html: калькулятор всё ещё умножает цену на число людей")

    # ── 4. Личный кабинет ───────────────────────────────────────────────────
    billing = read("smartweb/frontend/src/components/Billing.jsx")
    expect("Start — 1 490 ₽ в месяц, Team — 49 990 ₽ в год единовременно" in billing,
           "Billing.jsx: текст с ценами разошёлся с каталогом")
    expect("setPeriod" not in billing,
           "Billing.jsx: переключатель периода вернулся, хотя период задаёт тариф")

    # ── 5. Мобильное приложение ─────────────────────────────────────────────
    tariff = read("mobile/src/screens/TariffScreen.tsx")
    # Экран берёт подписи из словаря, поэтому проверяем связку ключ -> значение,
    # а не литералы в .tsx: иначе перевод интерфейса ломает проверку тарифов.
    import json as _json
    ru = _json.loads(read("mobile/src/i18n/locales/ru.json"))["ui"]
    for key, value in (("1_490_mes", "1 490 ₽/мес"), ("49_990_god", "49 990 ₽/год"),
                       ("cena_dogovornaya", "Цена договорная"), ("cena_po_zaprosu", "Цена по запросу"),
                       ("do_5_polzovateley_1_komanda", "до 5 пользователей, 1 команда"),
                       ("do_30_polzovateley_1_komanda", "до 30 пользователей, 1 команда")):
        expect(f"ui.{key}" in tariff, f"TariffScreen.tsx: не используется ключ ui.{key}")
        expect(ru.get(key) == value, f"ru.json: ui.{key} = {ru.get(key)!r}, ожидалось {value!r}")
    for stale in ("'Старт'", "'Команда'", "'Компания'"):
        expect(stale not in tariff, f"TariffScreen.tsx: осталось старое название {stale}")

    # ── 6. Юридические документы ────────────────────────────────────────────
    legal = json.loads(read("legal/legal_docs.json"))
    tables = []
    for doc in legal["docs"]:
        for block in doc["blocks"]:
            if block["t"] == "table" and block["head"] and block["head"][0] == "Тариф":
                tables.append((doc["key"], block))
    expect(len(tables) == 2, f"legal_docs.json: ожидались таблицы тарифов в соглашении и оферте, найдено {len(tables)}")
    for key, table in tables:
        rows = {r[0]: r for r in table["rows"]}
        expect(list(rows) == ["Start", "Team", "Business", "Enterprise"],
               f"legal_docs.json ({key}): состав тарифов {list(rows)}")
        expect(rows.get("Start", [None, None])[1] == "1 490 ₽/мес",
               f"legal_docs.json ({key}): цена Start разошлась")
        expect(rows.get("Team", [None, None])[1] == "49 990 ₽/год",
               f"legal_docs.json ({key}): цена Team разошлась")
        expect(rows.get("Business", [None, None])[1] == "Цена договорная",
               f"legal_docs.json ({key}): цена Business разошлась")
        expect(rows.get("Enterprise", [None, None])[1] == "цена по запросу",
               f"legal_docs.json ({key}): цена Enterprise разошлась")
        expect(rows.get("Start", [None, None, None])[2] == "до 5",
               f"legal_docs.json ({key}): лимит пользователей Start разошёлся")
        expect(rows.get("Team", [None, None, None])[2] == "до 30",
               f"legal_docs.json ({key}): лимит пользователей Team разошёлся")

    # Сгенерированные документы должны быть свежими относительно источника.
    for path, needle in (
        ("landing/documents.html", "49 990 ₽/год"),
        ("smartweb/frontend/src/lib/legalDocs.js", "49 990 ₽/год"),
        ("mobile/src/lib/legalDocs.ts", "49 990 ₽/год"),
    ):
        expect(needle in read(path),
               f"{path}: документы не пересобраны — запустите node legal/generate.mjs")

    if problems:
        print("Расхождения в тарифной сетке:")
        for p in problems:
            print("  -", p)
        return 1
    print("Тарифная сетка совпадает: plans.py, лендинг, личный кабинет, приложение, документы.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
