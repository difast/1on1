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
# Задача 2: на шаге ввода кода капча НЕ требуется (без captcha_token -> проходит).
r = client.post("/api/auth/login", json={"email": "cap@a.com", "password": "Parol12345",
                                         "device_code": code},
                headers={"X-Device-Id": "dev-1"})
check("шаг ввода кода не требует капчи -> выдан токен", r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:80]}")
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
# Задача 3: при включённой 2FA код по email НЕ отправляется — после TOTP сразу
# выдаётся токен (вторым фактором служит код из приложения).
fresh_limits()
r = client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": "dev-2fa"})
check("2FA-вход -> сначала totp_required", r.status_code == 200 and r.json().get("status") == "totp_required", f"{r.status_code}")
r = client.post("/api/auth/login", json={"email": "sess@a.com", "password": "Parol12345", "captcha_token": "good",
                                         "totp_code": pyotp.TOTP(secret).now()}, headers={"X-Device-Id": "dev-2fa"})
check("после TOTP -> сразу токен (код по email не нужен при 2FA)",
      r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:80]}")
# Код по email при включённой 2FA не выпускается.
db = SessionLocal()
_uid_sess = db.query(User).filter(User.email == "sess@a.com").first().id
_no_code = db.query(AuthToken).filter(AuthToken.user_id == _uid_sess, AuthToken.purpose == "login_code",
                                      AuthToken.used_at.is_(None)).count()
db.close()
check("при 2FA новый код по email не выпущен", _no_code == 0, f"кодов {_no_code}")

print("\n== Код по email включается АВТОМАТИЧЕСКИ при настроенном SMTP (без флага) ==")
# Имитируем прод, где LOGIN_EMAIL_CODE не выставлен, но SMTP настроен.
fresh_limits()
from app.services import mailer as _mailer
from app.config import settings as _settings
_orig_flag, _orig_conf = _settings.login_email_code, _mailer.configured
_settings.login_email_code = False
_mailer.configured = lambda: True
try:
    uid3 = mk_user("auto@a.com")
    r = client.post("/api/auth/login", json={"email": "auto@a.com", "password": "Parol12345",
                                             "captcha_token": "good"}, headers={"X-Device-Id": "dev-auto"})
    check("SMTP настроен -> код по email требуется без флага",
          r.status_code == 200 and r.json().get("status") == "email_code_required", f"{r.status_code} {r.text[:80]}")
    _mailer.configured = lambda: False
    fresh_limits()
    r = client.post("/api/auth/login", json={"email": "auto@a.com", "password": "Parol12345",
                                             "captcha_token": "good"}, headers={"X-Device-Id": "dev-auto"})
    check("SMTP не настроен и флаг off -> код не требуется (нет блокировки входа)",
          r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:80]}")
finally:
    _settings.login_email_code, _mailer.configured = _orig_flag, _orig_conf

print("\n== Задача 4: исторические дубли (device_hash=NULL) схлопываются при входе ==")
fresh_limits()
uid4 = mk_user("hist@a.com")
# Три «старые» сессии того же браузера БЕЗ device_hash (как до дедупликации).
from app.services import sessions as _sess
_lbl = _sess.device_label("testclient")
db = SessionLocal()
for _ in range(3):
    db.add(UserSession(user_id=uid4, jti=_sess.new_jti(), device_hash=None, device_label=_lbl))
db.commit(); db.close()
def full_login4(dev):
    client.post("/api/auth/login", json={"email": "hist@a.com", "password": "Parol12345", "captcha_token": "good"},
                headers={"X-Device-Id": dev})
    c = login_code_for(uid4)
    return client.post("/api/auth/login", json={"email": "hist@a.com", "password": "Parol12345",
                                                "captcha_token": "good", "device_code": c},
                       headers={"X-Device-Id": dev})
full_login4("dev-hist")
db = SessionLocal()
n = db.query(UserSession).filter(UserSession.user_id == uid4, UserSession.revoked_at.is_(None)).count()
db.close()
check("после входа исторические дубли отозваны -> одна активная сессия", n == 1, f"сессий {n}")


print("\n== Задача 1/5: шифрование секрета TOTP работает и без SECRET_KEY (откат на JWT_SECRET) ==")
# На бою обычно задан JWT_SECRET, а SECRET_KEY пуст -> раньше crypto.encrypt в
# 2fa/setup падал (ConfigError -> 500 без CORS -> «нет ответа сервера»).
from app.services import crypto as _crypto
from app.config import settings as _s2
_orig_secret = _s2.secret_key
_s2.secret_key = ""
try:
    enc = _crypto.encrypt("JBSWY3DPEHPK3PXP")
    check("encrypt без SECRET_KEY (есть JWT_SECRET) -> не падает", isinstance(enc, str) and enc)
    check("decrypt возвращает исходный секрет", _crypto.decrypt(enc) == "JBSWY3DPEHPK3PXP")
finally:
    _s2.secret_key = _orig_secret


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки исправлений входа пройдены.")
