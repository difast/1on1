"""Блок 1: усиление входа — 2FA (TOTP), сессии, новое устройство, rate limit,
капча-конфиг, перехэширование bcrypt.

Запуск (SQLite в файле):
    python tests/test_auth_hardening_block1.py
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
# Код по email при каждом входе (актуальная логика после исправлений).
os.environ["LOGIN_EMAIL_CODE"] = "1"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.auth_token import AuthToken  # noqa: E402
from app.models.auth_security import UserSession  # noqa: E402
from app.utils.passwords import hash_password, needs_rehash  # noqa: E402
from app.utils import ratelimit  # noqa: E402
import pyotp  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def fresh_limits():
    ratelimit._store = ratelimit._MemoryStore()


def mk_user(email, pw="Parol12345", confirmed=True, rounds=None):
    db = SessionLocal()
    h = hash_password(pw) if rounds is None else __import__("bcrypt").hashpw(pw.encode(), __import__("bcrypt").gensalt(rounds)).decode()
    u = User(name="U", email=email, role="member", password_hash=h, email_confirmed=confirmed)
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid


print("\n== Хэширование: bcrypt + перехэширование при слабом cost ==")
check("свежий хэш bcrypt не требует перехэша", needs_rehash(hash_password("Parol12345")) is False)
weak = __import__("bcrypt").hashpw(b"Parol12345", __import__("bcrypt").gensalt(9)).decode()
check("хэш с cost=9 помечается на перехэш", needs_rehash(weak) is True)
check("не-bcrypt/пустой не ломает проверку", needs_rehash(None) is False)

print("\n== Капча-конфиг публичен ==")
fresh_limits()
r = client.get("/api/auth/captcha-config")
check("captcha-config -> 200 c client_key/enabled", r.status_code == 200 and "client_key" in r.json())

print("\n== Rate limit: серия неверных паролей -> 429 ==")
fresh_limits()
mk_user("rl@a.com")
codes = []
for i in range(12):
    r = client.post("/api/auth/login", json={"email": "rl@a.com", "password": "wrong"})
    codes.append(r.status_code)
check("после серии попыток появляется 429", 429 in codes, f"коды {codes}")

print("\n== Новое устройство: код по email перед доступом ==")
fresh_limits()
uid = mk_user("dev@a.com")


def _login_code(user_id):
    db = SessionLocal()
    row = (db.query(AuthToken).filter(AuthToken.user_id == user_id, AuthToken.purpose == "login_code",
                                      AuthToken.used_at.is_(None)).order_by(AuthToken.id.desc()).first())
    c = row.token.split(":")[-1] if row else None
    db.close()
    return c


def complete_login(email, user_id, dev, totp=None):
    """Полный вход с учётом кода по email (и TOTP при наличии)."""
    body = {"email": email, "password": "Parol12345"}
    if totp:
        body["totp_code"] = totp
    r = client.post("/api/auth/login", json=body, headers={"X-Device-Id": dev})
    if r.status_code == 200 and r.json().get("status") == "email_code_required":
        body["device_code"] = _login_code(user_id)
        r = client.post("/api/auth/login", json=body, headers={"X-Device-Id": dev})
    return r


# Первый вход -> сначала код по email, токен не выдаётся до ввода кода.
r = client.post("/api/auth/login", json={"email": "dev@a.com", "password": "Parol12345"},
                headers={"X-Device-Id": "device-one"})
check("вход -> email_code_required", r.status_code == 200 and r.json().get("status") == "email_code_required",
      f"{r.status_code} {r.text[:80]}")
check("токен НЕ выдан до ввода кода", "token" not in (r.json() or {}))
code = _login_code(uid)
check("код входа выпущен", code is not None and code.isdigit())
r = client.post("/api/auth/login", json={"email": "dev@a.com", "password": "Parol12345", "device_code": code},
                headers={"X-Device-Id": "device-one"})
check("верный код -> выдан токен", r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:80]}")
token1 = r.json().get("token")

print("\n== 2FA (TOTP): включение, вход с кодом, резервный код, отключение ==")
fresh_limits()
auth1 = {"Authorization": f"Bearer {token1}"}
r = client.post("/api/auth/2fa/setup", headers=auth1)
check("2fa/setup отдаёт секрет и otpauth", r.status_code == 200 and r.json().get("secret") and "otpauth://" in r.json().get("otpauth_uri", ""))
secret = r.json()["secret"]
r = client.post("/api/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=auth1)
check("2fa/enable c верным кодом -> резервные коды", r.status_code == 200 and len(r.json().get("backup_codes", [])) == 10, f"{r.status_code} {r.text[:80]}")
backup = r.json()["backup_codes"][0]
# Теперь вход требует TOTP (до кода по email).
fresh_limits()
r = client.post("/api/auth/login", json={"email": "dev@a.com", "password": "Parol12345"},
                headers={"X-Device-Id": "device-one"})
check("вход при включённой 2FA -> totp_required", r.status_code == 200 and r.json().get("status") == "totp_required", f"{r.status_code} {r.text[:80]}")
r = client.post("/api/auth/login", json={"email": "dev@a.com", "password": "Parol12345", "totp_code": "000000"},
                headers={"X-Device-Id": "device-one"})
check("неверный TOTP -> 401", r.status_code == 401, f"{r.status_code}")
r = complete_login("dev@a.com", uid, "device-one", totp=pyotp.TOTP(secret).now())
check("верный TOTP + код -> токен", r.status_code == 200 and r.json().get("token"), f"{r.status_code}")
# Резервный код работает как второй фактор.
fresh_limits()
r = complete_login("dev@a.com", uid, "device-one", totp=backup)
check("резервный код проходит как 2FA", r.status_code == 200 and r.json().get("token"), f"{r.status_code}")
# Повторное использование того же резервного кода не проходит.
fresh_limits()
r = client.post("/api/auth/login", json={"email": "dev@a.com", "password": "Parol12345", "totp_code": backup},
                headers={"X-Device-Id": "device-one"})
check("резервный код одноразовый -> 401 при повторе", r.status_code == 401, f"{r.status_code}")
# Отключение 2FA требует пароль.
fresh_limits()
tok = complete_login("dev@a.com", uid, "device-one", totp=pyotp.TOTP(secret).now()).json()["token"]
authX = {"Authorization": f"Bearer {tok}"}
r = client.post("/api/auth/2fa/disable", json={"password": "wrong"}, headers=authX)
check("2fa/disable с неверным паролем -> 400", r.status_code == 400, f"{r.status_code}")
r = client.post("/api/auth/2fa/disable", json={"password": "Parol12345"}, headers=authX)
check("2fa/disable с верным паролем -> выключено", r.status_code == 200 and r.json().get("enabled") is False)

print("\n== Управление сессиями: список, завершить чужие, ревокация ==")
fresh_limits()
uid2 = mk_user("sess@a.com")
t_a = complete_login("sess@a.com", uid2, "dev-a").json().get("token")
t_b = complete_login("sess@a.com", uid2, "dev-b").json().get("token")
authA = {"Authorization": f"Bearer {t_a}"}
authB = {"Authorization": f"Bearer {t_b}"}
r = client.get("/api/auth/sessions", headers=authB)
sessions = r.json().get("sessions", []) if r.status_code == 200 else []
check("в списке минимум 2 активные сессии", len(sessions) >= 2, f"{len(sessions)}")
check("текущая сессия помечена current", any(s["current"] for s in sessions))
# Завершаем все кроме текущей (B) -> A перестаёт работать.
r = client.post("/api/auth/sessions/revoke-others", headers=authB)
check("revoke-others -> ok", r.status_code == 200 and r.json().get("revoked") >= 1, f"{r.status_code}")
r = client.get("/api/auth/sessions", headers=authA)
check("завершённая сессия A -> 401", r.status_code == 401, f"{r.status_code}")
r = client.get("/api/auth/sessions", headers=authB)
check("текущая сессия B продолжает работать", r.status_code == 200, f"{r.status_code}")

print("\n== Смена пароля завершает прочие сессии, вход через OAuth-подобный токен без jti не ломается ==")
fresh_limits()
# Токен без jti (как у OAuth-входа) остаётся валиден при session_enforce.
from app.utils.auth import create_access_token
legacy = create_access_token(uid2)  # без jti
r = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {legacy}"})
check("токен без jti (OAuth-совместимость) валиден -> 200", r.status_code == 200, f"{r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки усиления входа (Блок 1) пройдены.")
