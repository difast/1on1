"""Этап 4: рекуррентная логика CloudPayments (без боевых ключей).

Отложенный даунгрейд платный->платный, крон обслуживания подписок (истёкшие
триалы, применение отложенного даунгрейда, отмена в конце периода), провайдерские
методы Subscriptions/Update и Cancel (inert без ключей, X-Request-ID на запросах).

Запуск: python tests/test_billing_recurring.py
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
# Боевых ключей CloudPayments нет — серверные вызовы должны быть inert.
os.environ.pop("CLOUDPAYMENTS_PUBLIC_ID", None)
os.environ.pop("CLOUDPAYMENTS_API_SECRET", None)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.services import subscriptions as subs, plans as plans_svc  # noqa: E402
from app.services.payments_cloudpayments import CloudPaymentsProvider  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal(); plans_svc.seed_plans(db); db.close()

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


print("\n== Провайдер: S2S-методы inert без боевых ключей, но с X-Request-ID ==")
p = CloudPaymentsProvider()
check("configured() = False без ключей", p.configured() is False)
res = p.subscription_cancel("sc_123")
check("Cancel без ключей -> not_configured, реальных денег нет",
      res.get("configured") is False and res.get("success") is False, f"{res}")
res = p.subscription_update("sc_123", amount=4990.0, interval="Month", period=1)
check("Update без ключей -> not_configured", res.get("configured") is False)

# С ключами — метод формирует запрос с X-Request-ID (сеть мокаем).
os.environ["CLOUDPAYMENTS_PUBLIC_ID"] = "pk_test"
os.environ["CLOUDPAYMENTS_API_SECRET"] = "sk_test"
p2 = CloudPaymentsProvider()
check("configured() = True с тестовыми ключами", p2.configured() is True)
captured = {}
import httpx
_orig_post = httpx.Client.post


def _fake_post(self, url, json=None, headers=None, auth=None, **kw):
    captured["url"] = url
    captured["headers"] = headers
    captured["json"] = json

    class _R:
        status_code = 200
        content = b"{}"

        def json(self):
            return {"Success": True, "Model": {}}
    return _R()


httpx.Client.post = _fake_post
try:
    out = p2.subscription_update("sc_1", amount=4990.0, interval="Month", period=1,
                                 request_id="req-xyz")
    check("Update с ключами уходит на /subscriptions/update", captured["url"].endswith("/subscriptions/update"))
    check("X-Request-ID проставлен на исходящем запросе", captured["headers"].get("X-Request-ID") == "req-xyz")
    check("Update -> success", out.get("success") is True)
    p2.subscription_cancel("sc_1")
    check("Cancel уходит на /subscriptions/cancel", captured["url"].endswith("/subscriptions/cancel"))
    check("Cancel генерирует X-Request-ID автоматически", bool(captured["headers"].get("X-Request-ID")))
finally:
    httpx.Client.post = _orig_post
    os.environ.pop("CLOUDPAYMENTS_PUBLIC_ID", None)
    os.environ.pop("CLOUDPAYMENTS_API_SECRET", None)


def mk_sub(**kw):
    db = SessionLocal()
    base = dict(subject_type="user", subject_id=kw.pop("uid"), plan_code="team",
                status="active", billing_period="month")
    base.update(kw)
    s = Subscription(**base)
    db.add(s); db.commit(); db.refresh(s); sid = s.id; db.close()
    return sid


print("\n== Отложенный даунгрейд платный->платный ==")
sid = mk_sub(uid=1001, plan_code="business", status="active",
             current_period_end=datetime.utcnow() + timedelta(days=10))
db = SessionLocal()
s = db.query(Subscription).filter(Subscription.id == sid).first()
subs.schedule_downgrade(db, s, "team", "month")
check("pending_plan_code сохранён", s.pending_plan_code == "team")
# Период ещё не закончился -> крон НЕ применяет.
subs.run_maintenance(db)
s = db.query(Subscription).filter(Subscription.id == sid).first()
check("до конца периода тариф не меняется", s.plan_code == "business" and s.pending_plan_code == "team")
db.close()
# Период закончился -> крон применяет отложенный даунгрейд.
db = SessionLocal()
s = db.query(Subscription).filter(Subscription.id == sid).first()
s.current_period_end = datetime.utcnow() - timedelta(minutes=1); db.commit()
stats = subs.run_maintenance(db)
s = db.query(Subscription).filter(Subscription.id == sid).first()
check("после периода тариф понижен на team", s.plan_code == "team", f"{s.plan_code}")
check("pending очищен после применения", s.pending_plan_code is None)
check("крон посчитал применённый даунгрейд", stats["downgrades_applied"] >= 1, f"{stats}")
db.close()

print("\n== Крон: истёкший триал -> Free ==")
sid = mk_sub(uid=1002, plan_code="start", status="trialing",
             trial_end=datetime.utcnow() - timedelta(hours=1))
db = SessionLocal()
stats = subs.run_maintenance(db)
s = db.query(Subscription).filter(Subscription.id == sid).first()
check("истёкший триал переведён на Free", s.status == "free" and s.plan_code == "free", f"{s.status}/{s.plan_code}")
check("крон посчитал истёкший триал", stats["trials_expired"] >= 1)
db.close()

print("\n== Крон: отмена в конце периода -> Free ==")
sid = mk_sub(uid=1003, plan_code="team", status="active", cancel_at_period_end=True,
             current_period_end=datetime.utcnow() - timedelta(minutes=1))
db = SessionLocal()
subs.run_maintenance(db)
s = db.query(Subscription).filter(Subscription.id == sid).first()
check("отменённая подписка после периода -> Free", s.status == "free")
db.close()

print("\n== Активная оплаченная подписка внутри периода не трогается ==")
sid = mk_sub(uid=1004, plan_code="team", status="active",
             current_period_end=datetime.utcnow() + timedelta(days=5))
db = SessionLocal()
subs.run_maintenance(db)
s = db.query(Subscription).filter(Subscription.id == sid).first()
check("активная подписка остаётся active", s.status == "active" and s.plan_code == "team")
db.close()


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки рекуррентной логики CloudPayments пройдены.")
