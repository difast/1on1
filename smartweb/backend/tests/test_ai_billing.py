"""Этап 2: учёт AI-себестоимости и квот.

Формула стоимости, бюджеты по тарифам и override, состояние квоты, пороги
80/90/100, урезанный режим после лимита, разбивка по участникам.

Запуск: python tests/test_ai_billing.py
"""
import os
import sys
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-assertions")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-assertions")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"
# Цены Grok (по умолчанию в конфиге, но фиксируем явно для устойчивости теста).
os.environ["AI_PRICE_INPUT_RUB_PER_MTOK"] = "168.75"
os.environ["AI_PRICE_OUTPUT_RUB_PER_MTOK"] = "337.50"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

import app.main as main  # noqa: E402  (регистрирует роутеры/модели)
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team, TeamMember  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.services import ai_billing, plans as plans_svc  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
plans_svc.seed_plans(db)  # засеять каталог тарифов (нужны ai_budget_rub)
db.close()

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def mk_user(email, role="member"):
    db = SessionLocal()
    u = User(name=email.split("@")[0], email=email, role=role,
             password_hash=hash_password("Parol12345"), email_confirmed=True)
    db.add(u); db.commit(); db.refresh(u); uid = u.id; db.close()
    return uid


def set_plan(owner_id, plan_code, override=None):
    db = SessionLocal()
    sub = Subscription(subject_type="user", subject_id=owner_id, plan_code=plan_code,
                       status="active", ai_budget_rub_override=override)
    db.add(sub); db.commit(); db.close()


print("\n== 2.1 Формула стоимости (provider-agnostic, цены из конфига) ==")
# 1 млн input + 1 млн output по ценам Grok = 168.75 + 337.50 = 506.25 ₽.
in_micro, out_micro = ai_billing.cost_micro(1_000_000, 1_000_000)
total_rub = (in_micro + out_micro) / ai_billing.MICRO
check("1 млн in + 1 млн out = 506.25 ₽", abs(total_rub - 506.25) < 0.001, f"{total_rub}")
# 500 input, 1500 output.
in_micro, out_micro = ai_billing.cost_micro(500, 1500)
exp = 500 / 1e6 * 168.75 + 1500 / 1e6 * 337.50
check("частичные токены считаются точно", abs((in_micro + out_micro) / ai_billing.MICRO - exp) < 1e-6,
      f"{(in_micro+out_micro)/ai_billing.MICRO} vs {exp}")

print("\n== 2.2 Бюджеты по тарифам и индивидуальный override ==")
lead = mk_user("lead@a.com", role="team_lead")
set_plan(lead, "start")
db = SessionLocal()
check("Start -> бюджет 300 ₽", ai_billing.budget_rub_for_owner(db, lead) == 300)
db.close()
lead2 = mk_user("lead2@a.com", role="team_lead")
set_plan(lead2, "team")
db = SessionLocal()
check("Team -> бюджет 1000 ₽", ai_billing.budget_rub_for_owner(db, lead2) == 1000)
db.close()
lead3 = mk_user("lead3@a.com", role="team_lead")
set_plan(lead3, "business", override=5000)
db = SessionLocal()
check("override переопределяет бюджет тарифа", ai_billing.budget_rub_for_owner(db, lead3) == 5000)
db.close()
lead4 = mk_user("lead4@a.com", role="team_lead")
set_plan(lead4, "enterprise")
db = SessionLocal()
check("Enterprise -> без жёсткого лимита (None)", ai_billing.budget_rub_for_owner(db, lead4) is None)
db.close()

print("\n== Расход участника относится на бюджет тимлида ==")
db = SessionLocal()
lead_u = db.query(User).filter(User.id == lead).first()
team = Team(name="T", team_lead_id=lead, invite_code="INV12345"); db.add(team); db.commit(); db.refresh(team)
member_id = mk_user("member@a.com")
db.add(TeamMember(team_id=team.id, user_id=member_id))
db.add(TeamMember(team_id=team.id, user_id=lead))
db.commit()
member_u = db.query(User).filter(User.id == member_id).first()
# Участник тратит AI -> владелец бюджета = тимлид.
owner_for_member = ai_billing.resolve_budget_owner_id(db, member_u)
check("владелец бюджета участника = тимлид", owner_for_member == lead, f"{owner_for_member}")
db.close()

print("\n== Запись расхода и сводка ==")
db = SessionLocal()
member_u = db.query(User).filter(User.id == member_id).first()
lead_u = db.query(User).filter(User.id == lead).first()
# Участник: 200 000 in / 100 000 out через Пита.
ai_billing.record_usage(db, user=member_u, feature="pit", input_tokens=200_000, output_tokens=100_000)
# Тимлид: 100 000 in / 50 000 out через ONE AI.
ai_billing.record_usage(db, user=lead_u, feature="one_ai", input_tokens=100_000, output_tokens=50_000)
s = ai_billing.usage_summary(db, lead)
# Ожидаемая стоимость: input (300k) + output (150k).
exp_rub = 300_000 / 1e6 * 168.75 + 150_000 / 1e6 * 337.50
check("сводка суммирует расход обоих на тимлида", abs(s["total_cost_rub"] - round(exp_rub, 2)) < 0.02,
      f"{s['total_cost_rub']} vs {round(exp_rub,2)}")
check("сводка считает 2 запроса", s["requests"] == 2, f"{s['requests']}")
db.close()

print("\n== 2.3/2.6 Состояние квоты и разбивка по участникам ==")
db = SessionLocal()
lead_u = db.query(User).filter(User.id == lead).first()
st = ai_billing.quota_state(db, lead_u)
check("бюджет в состоянии = 300", st["budget_rub"] == 300)
check("процент использования рассчитан", 0 < st["percent"] <= 100, f"{st['percent']}")
check("есть дата сброса лимита", bool(st["reset_date"]))
bd = ai_billing.per_member_breakdown(db, lead)
check("разбивка по участникам: 2 человека", len(bd) == 2, f"{len(bd)}")
check("разбивка отсортирована по стоимости (макс сверху)",
      bd[0]["ai_cost_rub"] >= bd[1]["ai_cost_rub"])
db.close()

print("\n== 2.4 Пороги уведомлений 80/90/100 ==")
check("порог 80%", ai_billing.quota_notice({"unlimited": False, "percent": 82})["level"] == "warning")
check("порог 90%", ai_billing.quota_notice({"unlimited": False, "percent": 93})["level"] == "critical")
check("порог 100%", ai_billing.quota_notice({"unlimited": False, "percent": 100})["level"] == "exhausted")
check("ниже 80% — нет уведомления", ai_billing.quota_notice({"unlimited": False, "percent": 50}) is None)
check("безлимит — нет уведомления", ai_billing.quota_notice({"unlimited": True, "percent": 100}) is None)

print("\n== 2.5 Урезанный режим после исчерпания бюджета ==")
# Тратим сверх бюджета Start (300 ₽): 2 млн out по 337.5 = 675 ₽ > 300.
db = SessionLocal()
lead_u = db.query(User).filter(User.id == lead).first()
ai_billing.record_usage(db, user=lead_u, feature="pit", input_tokens=0, output_tokens=2_000_000)
st = ai_billing.quota_state(db, lead_u)
check("после превышения бюджета -> degraded", st["degraded"] is True, f"used={st['used_rub']} budget={st['budget_rub']}")
plan = ai_billing.degraded_plan(db, lead_u)
check("урезанный режим: меньший max_tokens", plan["degraded"] and plan["max_tokens"] and plan["max_tokens"] <= 300)
db.close()
# Enterprise (безлимит) никогда не degraded.
db = SessionLocal()
lead4_u = db.query(User).filter(User.id == lead4).first()
ai_billing.record_usage(db, user=lead4_u, feature="one_ai", input_tokens=5_000_000, output_tokens=5_000_000)
st = ai_billing.quota_state(db, lead4_u)
check("Enterprise (безлимит) не переходит в degraded", st["degraded"] is False and st["unlimited"] is True)
db.close()


print("\n== 2.7 Админ-раздел AI Economics ==")
db = SessionLocal()
eco = ai_billing.admin_economics(db)
check("экономика: суммарная себестоимость AI > 0", eco["totals"]["total_ai_cost_rub"] > 0, f"{eco['totals']}")
check("экономика: есть средняя стоимость запроса", eco["totals"]["avg_cost_per_request_rub"] > 0)
check("экономика: разбивка по тарифам не пуста", len(eco["by_tier"]) >= 1)
check("экономика: разбивка по функциям содержит pit и one_ai",
      {f["feature"] for f in eco["by_feature"]} >= {"pit", "one_ai"}, f"{[f['feature'] for f in eco['by_feature']]}")
check("экономика: топ клиентов отсортирован по стоимости",
      len(eco["top_clients"]) >= 1 and all(
          eco["top_clients"][i]["ai_cost_rub"] >= eco["top_clients"][i + 1]["ai_cost_rub"]
          for i in range(len(eco["top_clients"]) - 1)))
check("экономика: указана модель в ценах", bool(eco["prices"]["model"]))
# Выручка: активировали 4 платные подписки -> revenue > 0, есть маржа.
check("экономика: месячная выручка посчитана", eco["revenue"]["monthly_revenue_rub"] > 0, f"{eco['revenue']}")
check("экономика: AI Cost/Revenue и маржа рассчитаны",
      eco["revenue"]["ai_cost_to_revenue_percent"] is not None and eco["revenue"]["gross_margin_after_ai_percent"] is not None)
db.close()


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки учёта AI-себестоимости пройдены.")
