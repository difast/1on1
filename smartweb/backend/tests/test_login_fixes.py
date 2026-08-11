"""Исправления входа: обязательная капча, дедуп сессий, код по email при каждом
входе + уведомление о новом устройстве, полный сценарий 2FA.

Запуск: python tests/test_login_fixes.py
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
os.environ["SESSION_ENFORCE"] = "1"
os.environ["LOGIN_EMAIL_CODE"] = "1"
os.environ["CAPTCHA_SERVER_KEY"] = "test-captcha-key"   # -> капча настроена => обязательна

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.auth_token import AuthToken  # noqa: E402
from app.models.auth_security import UserSession  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit  # noqa: E402
from app.services import captcha  # noqa: E402
import pyotp  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

# Капча настроена -> обязательна. Подменяем сетевую проверку: токен "good" валиден.
captcha.verify = lambda token, ip=None: token == "good"

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def fresh_limits():
    ratelimit._store = ratelimit._MemoryStore()


def mk_user(email, pw="Parol12345"):
    db = SessionLocal()
    u = User(name="U", email=email, role="member", password_hash=hash_password(pw), email_confirmed=True)
    db.add(u); db.commit(); db.refresh(u); uid = u.id; db.close()
    return uid


def login_code_for(uid):
    db = SessionLocal()
    row = (db.query(AuthToken).filter(AuthToken.user_id == uid, AuthToken.purpose == "login_code",
                                      AuthToken.used_at.is_(None)).order_by(AuthToken.id.desc()).first())
    code = row.token.split(":")[-1] if row else None
    db.close()
    return code


print("\n== Задача 1: капча обязательна на бэкенде ==")
fresh_limits()
uid = mk_user("cap@a.com")
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345"})
check("вход без токена капчи -> 400", r.status_code == 400, f"{r.status_code} {r.text[:80]}")
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345", "captcha_token": "bad"})
check("вход с неверной капчей -> 400", r.status_code == 400, f"{r.status_code}")
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": "dev-1"})
check("вход с верной капчей -> проходит к коду (email_code_required)",
      r.status_code == 200 and r.json().get("status") == "email_code_required", f"{r.status_code} {r.text[:80]}")

print("\n== Задача 7: код по email при КАЖДОМ входе + новое устройство -> уведомление ==")
code = login_code_for(uid)
check("код входа выпущен и отправлен", code is not None and code.isdigit())
# Новое устройство -> в аудите есть отдельное уведомление о новом входе.
db = SessionLocal()
has_notice = db.query(AuditLog).filter(AuditLog.user_id if False else AuditLog.actor_id == uid,
                                       AuditLog.action_type == "auth.new_device_login").count() > 0
db.close()
check("параллельно отправлено уведомление о новом устройстве", has_notice)
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345",
                                         "captcha_token": "good", "device_code": code},
                headers={"X-Device-Id": "dev-1"})
check("верный код -> выдан токен", r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:80]}")
# Повторный вход с ИЗВЕСТНОГО устройства ТОЖЕ требует код (код всегда).
fresh_limits()
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": "dev-1"})
check("известное устройство тоже требует код (код всегда)",
      r.status_code == 200 and r.json().get("status") == "email_code_required", f"{r.status_code}")

print("\n== Задача 4: сессии не дублируются для одного устройства ==")
fresh_limits()
uid2 = mk_user("sess@a.com")
def full_login(dev):
    client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": dev})
    c = login_code_for(uid2)
    return client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345",
                                                "captcha_token": "good", "device_code": c},
                       headers={"X-Device-Id": dev})
full_login("dev-x"); full_login("dev-x"); full_login("dev-x")  # три входа с ОДНОГО устройства
db = SessionLocal()
n_same = db.query(UserSession).filter(UserSession.user_id == uid2, UserSession.revoked_at.is_(None)).count()
db.close()
check("три входа с одного устройства -> одна активная сессия", n_same == 1, f"сессий {n_same}")
full_login("dev-y")  # другое устройство -> вторая сессия
db = SessionLocal()
n_total = db.query(UserSession).filter(UserSession.user_id == uid2, UserSession.revoked_at.is_(None)).count()
db.close()
check("другое устройство -> отдельная сессия", n_total == 2, f"сессий {n_total}")

print("\n== Задача 5: полный сценарий включения 2FA ==")
fresh_limits()
tok = full_login("dev-2fa").json().get("token")
auth = {"Authorization": f"Bearer {tok}"}
r = client.post("/api/auth/2fa/setup", headers=auth)
check("2fa/setup -> секрет + otpauth", r.status_code == 200 and r.json().get("secret") and "otpauth://" in r.json().get("otpauth_uri", ""), f"{r.status_code} {r.text[:80]}")
secret = r.json()["secret"]
r = client.post("/api/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=auth)
check("2fa/enable -> включено + 10 резервных кодов", r.status_code == 200 and len(r.json().get("backup_codes", [])) == 10, f"{r.status_code} {r.text[:80]}")
r = client.get("/api/auth/2fa/status", headers=auth)
check("2fa/status -> enabled=true", r.status_code == 200 and r.json().get("enabled") is True)
# Вход с включённой 2FA: сначала totp, потом код по email.
fresh_limits()
r = client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": "dev-2fa"})
check("2FA-вход -> сначала totp_required", r.status_code == 200 and r.json().get("status") == "totp_required", f"{r.status_code}")
r = client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345", "captcha_token": "good",
                                         "totp_code": pyotp.TOTP(secret).now()}, headers={"X-Device-Id": "dev-2fa"})
check("после TOTP -> код по email", r.status_code == 200 and r.json().get("status") == "email_code_required", f"{r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки исправлений входа пройдены.")
