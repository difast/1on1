"""Блок 7 безопасности: защита внешних соединений.

Проверяем реальный HTTP-слой:
  - CloudPayments вебхук: неверная подпись отклоняется; верная обрабатывается;
    повторная доставка того же TransactionId идемпотентна (без двойной активации).
  - Telegram вебхук: без секретного заголовка / с неверным — 403; Mini App и
    Login Widget с неверной подписью — отказ.
  - Исходящие вебхуки: URL во внутреннюю сеть отклоняется (SSRF).
  - OAuth CSRF-state: подпись и срок жизни (max_age) проверяются.

Запуск (SQLite в файле):
    python tests/test_integration_security.py
"""
import os
import sys
import time
import hmac
import base64
import hashlib
import tempfile
from urllib.parse import urlencode

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-assertions")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-assertions")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"
# Секреты интеграций для теста подписи (в проде — только из окружения).
os.environ["CLOUDPAYMENTS_API_SECRET"] = "test-cp-secret"
os.environ["TELEGRAM_BOT_TOKEN"] = "123456:test-bot-token"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team, TeamMember  # noqa: E402
from app.models.subscription import Payment  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit  # noqa: E402
from app.services import subscriptions as subs  # noqa: E402
from app.services import oauth_state  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def fresh_limits():
    ratelimit._store = ratelimit._MemoryStore()


def auth(uid):
    return {"Authorization": f"Bearer {create_access_token(uid)}"}


CP_SECRET = "test-cp-secret"


def cp_sign(body: bytes) -> str:
    return base64.b64encode(hmac.new(CP_SECRET.encode(), body, hashlib.sha256).digest()).decode()


def cp_post(form: dict, sign_ok=True):
    body = urlencode(form).encode()
    sig = cp_sign(body) if sign_ok else "invalid-signature=="
    return client.post(
        "/api/billing/webhooks/cloudpayments",
        content=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Content-HMAC": sig},
    )


# ── подготовка пользователя с ожидающим платежом ──────────────────────────────
db = SessionLocal()
u = User(name="Плательщик", email="pay@a.com", role="team_lead",
         password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(u); db.commit(); db.refresh(u)
uid = u.id
pay = Payment(subject_type="user", subject_id=uid, amount=149000, currency="RUB",
              status="pending", provider="cloudpayments",
              payload={"plan_code": "start", "period": "month", "seats": 1})
db.add(pay); db.commit(); db.refresh(pay)
pay_id = pay.id
db.close()


print("\n== CloudPayments: проверка подписи вебхука ==")
fresh_limits()
form = {"Event": "Pay", "TransactionId": "TX1001", "InvoiceId": str(pay_id),
        "AccountId": str(uid), "Amount": "1490.00", "Currency": "RUB", "Status": "Completed"}
r = cp_post(form, sign_ok=False)
check("вебхук с неверной подписью -> 401", r.status_code == 401, f"код {r.status_code}")
# Подписка не должна активироваться при неверной подписи.
db = SessionLocal()
sub = subs.get_subscription(db, "user", uid)
check("при неверной подписи подписка не активирована", sub is None or sub.status != "active",
      f"статус {getattr(sub, 'status', None)}")
db.close()

print("\n== CloudPayments: корректный вебхук активирует подписку ==")
fresh_limits()
r = cp_post(form, sign_ok=True)
check("верный вебхук -> 200 code=0", r.status_code == 200 and r.json().get("code") == 0,
      f"код {r.status_code}, тело {r.text[:80]}")
db = SessionLocal()
sub = subs.get_subscription(db, "user", uid)
check("подписка активирована после верного вебхука", sub is not None and sub.status == "active",
      f"статус {getattr(sub, 'status', None)}")
end1 = sub.current_period_end if sub else None
db.close()

print("\n== CloudPayments: идемпотентность (повторная доставка) ==")
fresh_limits()
r = cp_post(form, sign_ok=True)  # тот же TransactionId
check("повторный вебхук -> 200 (принят)", r.status_code == 200, f"код {r.status_code}")
db = SessionLocal()
# Дубликатов платежа с этим TransactionId быть не должно (ровно один succeeded).
n_succeeded = db.query(Payment).filter(Payment.external_id == "TX1001").count()
check("платёж не задублирован (ровно 1 по TransactionId)", n_succeeded == 1, f"найдено {n_succeeded}")
db.close()

print("\n== Telegram: секретный токен вебхука обязателен ==")
fresh_limits()
r = client.post("/api/telegram/webhook", json={"update_id": 1})
check("вебхук без секретного заголовка -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.post("/api/telegram/webhook", json={"update_id": 1},
                headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"})
check("вебхук с неверным секретом -> 403", r.status_code == 403, f"код {r.status_code}")

print("\n== Telegram: Mini App / Login Widget с неверной подписью ==")
fresh_limits()
r = client.post("/api/telegram/miniapp-auth", json={"init_data": "user=%7B%22id%22%3A1%7D&hash=deadbeef"})
check("Mini App с неверным initData -> 401", r.status_code == 401, f"код {r.status_code}")
r = client.post("/api/telegram/callback", json={"id": 1, "auth_date": int(time.time()), "hash": "deadbeef"})
check("Login Widget с неверным hash -> 401", r.status_code == 401, f"код {r.status_code}")

print("\n== Исходящие вебхуки: защита от SSRF (внутренний URL) ==")
fresh_limits()
db = SessionLocal()
lead = User(name="Лид", email="lead7@a.com", role="team_lead",
            password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(lead); db.commit(); db.refresh(lead)
lead_id = lead.id
team = Team(name="T7", invite_code="code7", team_lead_id=lead_id)
db.add(team); db.commit(); db.refresh(team)
team_id = team.id
db.add(TeamMember(team_id=team_id, user_id=lead_id, role="lead")); db.commit()
db.close()
for bad_url in ("http://127.0.0.1:8000/hook", "http://169.254.169.254/latest/meta-data",
                "http://10.0.0.5/x", "http://localhost/x"):
    r = client.post("/api/integrations/webhooks",
                    json={"team_id": team_id, "user_id": lead_id, "url": bad_url, "events": ["task.created"]},
                    headers=auth(lead_id))
    check(f"внутренний URL отклонён ({bad_url}) -> 422", r.status_code == 422, f"код {r.status_code}")
# Публичный URL принимается (проверяем, что защита не ломает легитимный случай).
r = client.post("/api/integrations/webhooks",
                json={"team_id": team_id, "user_id": lead_id, "url": "https://example.com/hook",
                      "events": ["task.created"]},
                headers=auth(lead_id))
check("публичный URL вебхука принят -> 200", r.status_code == 200, f"код {r.status_code}")

print("\n== OAuth CSRF-state: подпись и срок жизни ==")
fresh_limits()
st = oauth_state.make_state(42, "google")
check("валидный state читается (user_id=42)", oauth_state.read_state(st, "google") == 42)
check("state другого провайдера отклонён", oauth_state.read_state(st, "yandex") is None)
# Подделка: меняем символ внутри строки (ломает подпись, длина сохраняется).
_i = len(st) // 2
_tampered = st[:_i] + ("A" if st[_i] != "A" else "B") + st[_i + 1:]
check("подделанный state отклонён", oauth_state.read_state(_tampered, "google") is None,
      f"вернулось {oauth_state.read_state(_tampered, 'google')}")
# max_age=0: любой ненулевой возраст считается просроченным -> None (проверка срока).
check("просроченный state (max_age) отклонён", oauth_state.read_state(st, "google", max_age=0) is None)
# Свежий state в пределах окна принимается.
check("свежий state в окне max_age принят", oauth_state.read_state(st, "google", max_age=900) == 42)


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки безопасности интеграций пройдены.")
