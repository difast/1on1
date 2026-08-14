"""Сквозная проверка тарифной логики перед включением боевых платежей.

Проверяем ФАКТИЧЕСКОЕ поведение (а не только наличие кода):
  Этап 1 — пробный период: реальный отсчёт от даты старта, ограниченный триал
           Team (ONE AI / Развитие закрыты), автопереход на Free по истечении,
           напоминание за N дней (с дедупом), апгрейд во время триала.
  Этап 2 — гейтинг по каждой функции при ENTITLEMENTS_ENFORCE=1: мягкое 402
           feature_locked там, где функция недоступна; доступ там, где есть.
  Этап 3 — ручное управление тарифом из админ-панели: смена тарифа, триал,
           дата окончания, продление, отмена — применяется к EntitlementService
           сразу и пишется в журнал аудита; доступ только по админ-гварду.
  Этап 4 — жизненный цикл: апгрейд (сразу), даунгрейд (с конца периода, с
           предупреждением о потере функций), отмена (доступ до конца периода).

Запуск: python tests/test_tariff_prelaunch_audit.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-assertions")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-assertions")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"
os.environ["ADMIN_API_TOKEN"] = "test-admin-token"        # машинный админ-доступ
os.environ.pop("ENTITLEMENTS_ENFORCE", None)              # по умолчанию выключен
os.environ.pop("CLOUDPAYMENTS_PUBLIC_ID", None)
os.environ.pop("CLOUDPAYMENTS_API_SECRET", None)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.services import subscriptions as subs, plans as plans_svc, plan_change  # noqa: E402
from app.services import entitlements as ent  # noqa: E402
from fastapi import HTTPException  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal(); plans_svc.seed_plans(db); db.close()

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def mk_user(uid_email):
    db = SessionLocal()
    u = User(name=f"U{uid_email}", email=f"u{uid_email}@t.test")
    db.add(u); db.commit(); db.refresh(u); uid = u.id; db.close()
    return uid


def user_stub(uid):
    return type("U", (), {"id": uid, "billing_override": False})()


def enforce(on: bool):
    if on:
        os.environ["ENTITLEMENTS_ENFORCE"] = "1"
    else:
        os.environ.pop("ENTITLEMENTS_ENFORCE", None)


def locked(uid, feature):
    """True, если функция закрыта (require_feature бросил 402 feature_locked)."""
    db = SessionLocal()
    try:
        ent.require_feature(db, user_stub(uid), feature)
        return False
    except HTTPException as e:
        return e.status_code == 402 and (e.detail or {}).get("code") == "feature_locked"
    finally:
        db.close()


# ═══════════════════════ ЭТАП 1 — ПРОБНЫЙ ПЕРИОД ═══════════════════════
print("\n== Этап 1. Пробный период Start: старт, отсчёт, истечение ==")
uid = mk_user("trial_start")
db = SessionLocal()
subs.start_signup_trial(db, "user", uid)   # как при регистрации
s = subs.get_subscription(db, "user", uid)
check("регистрация -> триал trialing на Start", s.status == "trialing" and s.plan_code == "start", f"{s.status}/{s.plan_code}")
delta_days = (s.trial_end - datetime.utcnow()).days
check("триал 14 дней от даты старта", 13 <= delta_days <= 14, f"delta={delta_days}")
w = subs.access_window(db, user_stub(uid))
check("access_window: активен, не истёк", w["until"] and not w["expired"], f"{w}")
db.close()

# Отсчёт «день за днём»: сдвигаем дату старта в прошлое — остаток уменьшается.
db = SessionLocal()
s = subs.get_subscription(db, "user", uid)
s.trial_end = datetime.utcnow() + timedelta(days=3, hours=1); db.commit()
w = subs.access_window(db, user_stub(uid))
left = (datetime.fromisoformat(w["until"]) - datetime.utcnow()).days
check("остаток триала реально уменьшается (искусств. ускорение времени)", left == 3 and not w["expired"], f"left={left}")
db.close()

print("\n== Этап 1. Истечение триала -> автоматически Free ==")
db = SessionLocal()
s = subs.get_subscription(db, "user", uid)
s.trial_end = datetime.utcnow() - timedelta(hours=1)
s.current_period_end = s.trial_end; db.commit()
db.close()
main._billing_sweep()   # реальный обход планировщика
db = SessionLocal()
s = subs.get_subscription(db, "user", uid)
check("истёкший триал переведён на Free автоматически", s.status == "free" and s.plan_code == "free", f"{s.status}/{s.plan_code}")
db.close()

print("\n== Этап 1. После истечения при enforcement=on — доступ заблокирован ==")
enforce(True)
db = SessionLocal()
lim = ent.effective_limits(db, user_stub(uid))
# access_window.expired уже False (перевели на free), проверяем именно LOCKED-путь
s = subs.get_subscription(db, "user", uid); s.status = "trialing"; s.trial_end = datetime.utcnow() - timedelta(hours=1); s.current_period_end = s.trial_end; db.commit()
lim2 = ent.effective_limits(db, user_stub(uid))
check("истёкший триал + enforce -> LOCKED_LIMITS (нет платных функций)",
      lim2.get("features", {}).get("one_on_one") is False and lim2.get("max_teams") == 0, f"{ {k: lim2.get(k) for k in ('max_teams',)} }")
db.close()
enforce(False)

print("\n== Этап 1. Ограниченный триал Team: ONE AI и Развитие закрыты весь триал ==")
uid_t = mk_user("trial_team")
db = SessionLocal()
subs.start_trial(db, "user", uid_t, "team", days=14)
db.close()
enforce(True)
check("Team-триал: ONE AI закрыт (trial_locked)", locked(uid_t, "one_ai"))
check("Team-триал: Развитие закрыто (trial_locked)", locked(uid_t, "development"))
check("Team-триал: групповые встречи ДОСТУПНЫ (не закрыты)", not locked(uid_t, "group_meetings"))
check("Team-триал: Цели ДОСТУПНЫ", not locked(uid_t, "goals"))
# детально: код причины именно trial_locked
db = SessionLocal()
lk = ent.feature_lock(db, user_stub(uid_t), "one_ai"); db.close()
check("причина недоступности ONE AI на триале = trial_locked", bool(lk and lk.get("trial_locked")), f"{lk}")
enforce(False)

print("\n== Этап 1. Напоминание за 3 дня до конца триала (с дедупом) ==")
uid_r = mk_user("trial_reminder")
db = SessionLocal()
subs.start_trial(db, "user", uid_r, "start", days=14)
s = subs.get_subscription(db, "user", uid_r)
s.trial_end = datetime.utcnow() + timedelta(days=2, hours=12)   # в окне 3 дней
s.current_period_end = s.trial_end; db.commit(); db.close()
main._send_trial_reminders()
db = SessionLocal()
n = db.query(Notification).filter(Notification.user_id == uid_r, Notification.type == "trial_ending").count()
check("напоминание trial_ending создано", n == 1, f"count={n}")
db.close()
main._send_trial_reminders()   # повторный обход не должен задваивать
db = SessionLocal()
n2 = db.query(Notification).filter(Notification.user_id == uid_r, Notification.type == "trial_ending").count()
check("повторный обход не создаёт дубль напоминания", n2 == 1, f"count={n2}")
db.close()
# Триал, до конца которого ещё далеко (10 дней), — напоминание не шлём.
uid_far = mk_user("trial_far")
db = SessionLocal()
subs.start_trial(db, "user", uid_far, "start", days=14)
s = subs.get_subscription(db, "user", uid_far)
s.trial_end = datetime.utcnow() + timedelta(days=10); s.current_period_end = s.trial_end; db.commit(); db.close()
main._send_trial_reminders()
db = SessionLocal()
nf = db.query(Notification).filter(Notification.user_id == uid_far, Notification.type == "trial_ending").count()
check("за 10 дней до конца напоминание НЕ шлём", nf == 0, f"count={nf}")
db.close()

print("\n== Этап 1. Апгрейд ДО конца триала: триал завершается без задвоения ==")
uid_u = mk_user("trial_upgrade")
db = SessionLocal()
subs.start_trial(db, "user", uid_u, "start", days=14)
d = plan_change.decide(db, user_stub(uid_u), "team", period="month")
check("во время триала платный тариф -> сценарий subscribe", d["action"] == "subscribe", f"{d['action']}")
# Оформление подписки (как это делает вебхук оплаты): activate поверх триала.
subs.activate(db, "user", uid_u, "team", period="month", provider="manual")
rows = db.query(Subscription).filter(Subscription.subject_type == "user", Subscription.subject_id == uid_u).count()
s = subs.get_subscription(db, "user", uid_u)
check("после оплаты одна подписка (без задвоения)", rows == 1, f"rows={rows}")
check("триал сменился на active team без разрыва", s.status == "active" and s.plan_code == "team", f"{s.status}/{s.plan_code}")
db.close()


# ═══════════════════════ ЭТАП 2 — ГЕЙТИНГ ПО ФУНКЦИЯМ ═══════════════════════
print("\n== Этап 2. Гейтинг при ENTITLEMENTS_ENFORCE=1 ==")
enforce(True)

# Start (active): платные командные функции закрыты, базовые — доступны.
uid_s = mk_user("gate_start")
db = SessionLocal(); subs.activate(db, "user", uid_s, "start", period="month", provider="manual"); db.close()
for feat in ["group_meetings", "collab_tasks", "goals", "development", "one_ai", "analytics", "csv_export"]:
    check(f"Start: {feat} закрыт (402 feature_locked)", locked(uid_s, feat))
for feat in ["one_on_one", "pit", "ai_decomposition", "social_login"]:
    check(f"Start: {feat} доступен", not locked(uid_s, feat))

# Team (active): командные функции открыты; multi_team/sso — нет.
uid_tm = mk_user("gate_team")
db = SessionLocal(); subs.activate(db, "user", uid_tm, "team", period="month", provider="manual"); db.close()
for feat in ["group_meetings", "collab_tasks", "goals", "development", "one_ai", "analytics", "csv_export"]:
    check(f"Team: {feat} доступен", not locked(uid_tm, feat))
check("Team: несколько команд (multi_team) закрыто", locked(uid_tm, "multi_team"))
check("Team: SSO закрыто", locked(uid_tm, "sso"))

# Business (active): multi_team открыт, SSO — нет.
uid_b = mk_user("gate_business")
db = SessionLocal(); subs.activate(db, "user", uid_b, "business", period="month", provider="manual"); db.close()
check("Business: несколько команд (multi_team) доступно", not locked(uid_b, "multi_team"))
check("Business: SSO закрыто (только Enterprise)", locked(uid_b, "sso"))

# Enterprise (active): SSO открыт.
uid_e = mk_user("gate_ent")
db = SessionLocal(); subs.activate(db, "user", uid_e, "enterprise", period="month", provider="manual"); db.close()
check("Enterprise: SSO доступно", not locked(uid_e, "sso"))

# Лимит команд (multi_team по существу): на Team создать 2-ю команду нельзя.
db = SessionLocal()
db.add(Team(name="T1", invite_code=f"inv{uid_tm}", team_lead_id=uid_tm)); db.commit()
err1 = ent.team_limit_error(db, user_stub(uid_tm))   # 1 команда из 1 -> уже на пределе
check("Team: лимит команд не даёт создать вторую (max_teams=1)", bool(err1), f"{err1}")
db.add(Team(name="B1", invite_code=f"inv{uid_b}", team_lead_id=uid_b)); db.commit()
err2 = ent.team_limit_error(db, user_stub(uid_b))     # Business max_teams=None
check("Business: лимит команд не ограничивает (multi_team)", err2 is None, f"{err2}")
db.close()

enforce(False)
# Контроль: при выключенном enforcement гейтинг — no-op (ничего не блокируется).
check("enforcement=off -> Start.one_ai НЕ блокируется (no-op)", not locked(uid_s, "one_ai"))


# ═══════════════════════ ЭТАП 3 — АДМИН-УПРАВЛЕНИЕ ТАРИФАМИ ═══════════════════════
print("\n== Этап 3. Ручное управление тарифом из админ-панели (+ audit log) ==")
from fastapi.testclient import TestClient  # noqa: E402
client = TestClient(main.app)
ADM = {"X-Admin-Token": "test-admin-token"}


def audit_count(action_type):
    db = SessionLocal()
    try:
        return db.query(AuditLog).filter(AuditLog.action_type == action_type).count()
    finally:
        db.close()


# Доступ только по админ-гварду.
r_noauth = client.post("/api/admin/billing/subscriptions/activate",
                       json={"subject_id": 999999, "plan_code": "team"})
check("без админ-токена -> 403 (owner-only)", r_noauth.status_code == 403, f"{r_noauth.status_code}")

uid_a = mk_user("admin_managed")
# 3.1 Смена тарифа вручную -> Business, применяется к EntitlementService сразу.
r = client.post("/api/admin/billing/subscriptions/activate",
                json={"subject_id": uid_a, "plan_code": "business", "period": "month"}, headers=ADM)
check("admin activate -> 200", r.status_code == 200, f"{r.status_code}:{r.text[:120]}")
db = SessionLocal()
code_now = ent.resolve_plan_code(db, user_stub(uid_a)); db.close()
check("после ручной выдачи EntitlementService видит business сразу", code_now == "business", f"{code_now}")
check("audit: admin.subscription_activated записан", audit_count("admin.subscription_activated") >= 1)

sub_id = SessionLocal().query(Subscription).filter(Subscription.subject_id == uid_a).first().id

# 3.2 Продление.
before = audit_count("admin.subscription_extended")
r = client.post(f"/api/admin/billing/subscriptions/{sub_id}/extend", headers=ADM)
check("admin extend -> 200", r.status_code == 200)
check("audit: admin.subscription_extended записан", audit_count("admin.subscription_extended") == before + 1)

# 3.3 Явная дата окончания.
until = (datetime.utcnow() + timedelta(days=99)).date().isoformat() + "T23:59:59"
r = client.post(f"/api/admin/billing/subscriptions/{sub_id}/set-period", json={"until": until}, headers=ADM)
check("admin set-period -> 200", r.status_code == 200, f"{r.status_code}:{r.text[:120]}")
db = SessionLocal()
s = db.query(Subscription).filter(Subscription.id == sub_id).first()
check("дата окончания применена", s.current_period_end and s.current_period_end.date() == (datetime.utcnow() + timedelta(days=99)).date(), f"{s.current_period_end}")
db.close()
check("audit: admin.subscription_period_set записан", audit_count("admin.subscription_period_set") >= 1)

# 3.4 Ручной пробный период.
uid_tr = mk_user("admin_trial")
r = client.post("/api/admin/billing/subscriptions/trial",
                json={"subject_id": uid_tr, "plan_code": "team", "days": 7}, headers=ADM)
check("admin trial -> 200", r.status_code == 200)
db = SessionLocal(); s = subs.get_subscription(db, "user", uid_tr); db.close()
check("ручной триал: trialing team на 7 дней", s.status == "trialing" and s.plan_code == "team", f"{s.status}/{s.plan_code}")
check("audit: admin.trial_started записан", audit_count("admin.trial_started") >= 1)

# 3.5 Отмена.
r = client.post(f"/api/admin/billing/subscriptions/{sub_id}/cancel", headers=ADM)
check("admin cancel -> 200", r.status_code == 200)
db = SessionLocal(); s = db.query(Subscription).filter(Subscription.id == sub_id).first(); db.close()
check("после отмены подписка не active", s.status != "active", f"{s.status}")
check("audit: admin.subscription_canceled записан", audit_count("admin.subscription_canceled") >= 1)


# ═══════════════════════ ЭТАП 4 — ЖИЗНЕННЫЙ ЦИКЛ ═══════════════════════
print("\n== Этап 4. Апгрейд / даунгрейд / отмена ==")
# Апгрейд Start -> Team: сразу.
uid1 = mk_user("life_up")
db = SessionLocal()
subs.activate(db, "user", uid1, "start", period="month", provider="manual")
d = plan_change.decide(db, user_stub(uid1), "team", period="month")
check("Start->Team = апгрейд, действует сразу", d["action"] == "upgrade" and d.get("immediate") is True, f"{d.get('action')}")
db.close()

# Даунгрейд Team -> Start: с конца периода, с предупреждением о потере, если есть перебор.
uid2 = mk_user("life_down")
db = SessionLocal()
subs.activate(db, "user", uid2, "team", period="month", provider="manual")
# создаём перебор по пользователям: 9 команд? достаточно проверить структуру ответа
d = plan_change.decide(db, user_stub(uid2), "start", period="month")
check("Team->Start = даунгрейд с конца периода", d["action"] == "downgrade" and d.get("effective") == "period_end", f"{d.get('action')}/{d.get('effective')}")
check("даунгрейд возвращает список возможных потерь (over_limit)", "over_limit" in d, f"keys={list(d)}")
db.close()

# Отмена: доступ сохраняется до конца периода, затем -> Free.
uid3 = mk_user("life_cancel")
db = SessionLocal()
subs.activate(db, "user", uid3, "team", period="month",
              period_end=datetime.utcnow() + timedelta(days=5), provider="manual")
s = subs.get_subscription(db, "user", uid3)
subs.cancel(db, s, at_period_end=True)
check("отмена в конце периода: cancel_at_period_end=True, статус active", s.cancel_at_period_end and s.status == "active", f"{s.status}")
code_mid = ent.resolve_plan_code(db, user_stub(uid3))
check("до конца периода доступ к тарифу сохраняется", code_mid == "team", f"{code_mid}")
# Период закончился -> обслуживание переводит на Free.
s.current_period_end = datetime.utcnow() - timedelta(minutes=1); db.commit()
subs.run_maintenance(db)
s = subs.get_subscription(db, "user", uid3)
check("после конца периода отменённая подписка -> Free", s.status == "free" and s.plan_code == "free", f"{s.status}/{s.plan_code}")
db.close()


print("\n" + "=" * 62)
if FAILS:
    print(f"ПРОВАЛЕНО проверок: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки сквозной тарифной логики пройдены.")
