"""Блок 9: шифрование чувствительных полей в покое + техническая база SSO (OIDC).

Проверяем:
  - meeting.notes/call_transcript/ai_summary шифруются в БД (в сырой строке нет
    открытого текста), но читаются через ORM прозрачно; legacy-открытый текст
    тоже читается;
  - SSO OIDC: authorize -> callback (со стаб-IdP) -> наш JWT; секрет клиента
    хранится зашифрованным; вход выдаёт валидный токен с сессией;
  - SSO создаётся только для Enterprise-организации (иначе 402);
  - админские SSO-эндпоинты закрыты require_admin.

Запуск: python tests/test_enterprise_block9.py
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402
import sqlite3  # noqa: E402
import datetime as _dt  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team, TeamMember  # noqa: E402
from app.models.meeting import Meeting  # noqa: E402
from app.models.sso import SsoConnection  # noqa: E402
from app.utils.auth import create_admin_token, _decode  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit  # noqa: E402
from app.services import crypto  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def admin_auth():
    return {"Authorization": f"Bearer {create_admin_token()}"}


SECRET_NOTE = "СЕКРЕТ: приватная заметка встречи о зарплате"
SECRET_TRANSCRIPT = "СЕКРЕТ: расшифровка личного разговора"

print("\n== Шифрование полей встречи в состоянии покоя ==")
db = SessionLocal()
u = User(name="U", email="enc@a.com", role="team_lead", password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(u); db.commit(); db.refresh(u)
m = Meeting(team_id=1, team_lead_id=u.id, member_id=u.id, scheduled_date=_dt.datetime.utcnow(),
            notes=SECRET_NOTE, call_transcript=SECRET_TRANSCRIPT, ai_summary="СЕКРЕТ: резюме",
            agenda="Публичная повестка")
db.add(m); db.commit(); db.refresh(m)
mid = m.id
db.close()

# Чтение через ORM — прозрачно расшифровано.
db = SessionLocal()
m2 = db.query(Meeting).filter(Meeting.id == mid).first()
check("ORM читает notes расшифрованными", m2.notes == SECRET_NOTE, f"{m2.notes!r}")
check("ORM читает transcript расшифрованными", m2.call_transcript == SECRET_TRANSCRIPT)
db.close()

# Прямое чтение из БД (мимо ORM) — открытого текста быть не должно.
raw = sqlite3.connect(_db_path)
row = raw.execute("SELECT notes, call_transcript, ai_summary, agenda FROM meetings WHERE id=?", (mid,)).fetchone()
raw.close()
check("в сырой БД нет открытого текста notes", SECRET_NOTE not in (row[0] or ""), f"{row[0]!r}")
check("в сырой БД нет открытого текста transcript", SECRET_TRANSCRIPT not in (row[1] or ""))
check("notes в БД выглядит как шифртекст (расшифровывается ключом)", crypto.decrypt(row[0]) == SECRET_NOTE)
check("agenda НЕ шифруется (осознанно, открытый текст)", row[3] == "Публичная повестка")

print("\n== Legacy: открытый текст, записанный до шифрования, читается ==")
raw = sqlite3.connect(_db_path)
raw.execute("UPDATE meetings SET notes=? WHERE id=?", ("ЛЕГАСИ открытый текст", mid))
raw.commit(); raw.close()
db = SessionLocal()
m3 = db.query(Meeting).filter(Meeting.id == mid).first()
check("legacy-открытый текст читается как есть", m3.notes == "ЛЕГАСИ открытый текст")
# И при следующей записи значение шифруется (новое содержимое заметки).
m3.notes = "Обновлённая заметка"; db.add(m3); db.commit(); db.close()
raw = sqlite3.connect(_db_path)
val = raw.execute("SELECT notes FROM meetings WHERE id=?", (mid,)).fetchone()[0]
raw.close()
check("новая запись поверх legacy зашифрована", crypto.decrypt(val) == "Обновлённая заметка" and "Обновлённая" not in val)

print("\n== SSO: админские эндпоинты закрыты, Enterprise-гейт ==")
ratelimit._store = ratelimit._MemoryStore()
r = client.get("/api/admin/sso")
check("список SSO без прав админа -> 401/403", r.status_code in (401, 403), f"{r.status_code}")
r = client.get("/api/admin/sso", headers=admin_auth())
check("список SSO админу -> 200", r.status_code == 200, f"{r.status_code}")

# Организация НЕ на Enterprise -> создание SSO 402.
db = SessionLocal()
lead = User(name="Лид", email="lead9@a.com", role="team_lead", password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(lead); db.commit(); db.refresh(lead)
team = Team(name="Org9", invite_code="code9", team_lead_id=lead.id)
db.add(team); db.commit(); db.refresh(team)
tid = team.id; lead_id = lead.id
db.add(TeamMember(team_id=tid, user_id=lead_id, role="lead")); db.commit()
db.close()
body = {"team_id": tid, "slug": "vtb", "oidc_issuer": "https://idp.example.com",
        "oidc_client_id": "cid", "oidc_client_secret": "supersecret",
        "oidc_authorization_endpoint": "https://idp.example.com/auth",
        "oidc_token_endpoint": "https://idp.example.com/token",
        "oidc_userinfo_endpoint": "https://idp.example.com/userinfo",
        "oidc_redirect_uri": "https://app.oneononehq.com/auth/sso/vtb"}
r = client.post("/api/admin/sso", json=body, headers=admin_auth())
check("SSO без Enterprise -> 402 feature_locked", r.status_code == 402, f"{r.status_code} {r.text[:80]}")

# Включаем Enterprise через billing override у владельца (полный доступ = все фичи).
db = SessionLocal()
lead = db.query(User).filter(User.id == lead_id).first()
lead.billing_override = True
db.commit(); db.close()
r = client.post("/api/admin/sso", json=body, headers=admin_auth())
check("SSO для Enterprise-орг создаётся -> 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

print("\n== SSO: секрет клиента хранится зашифрованным ==")
raw = sqlite3.connect(_db_path)
sec = raw.execute("SELECT oidc_client_secret_enc FROM sso_connections WHERE slug='vtb'").fetchone()[0]
raw.close()
check("client_secret в БД не в открытом виде", "supersecret" not in (sec or ""))
check("client_secret расшифровывается ключом", crypto.decrypt(sec) == "supersecret")

print("\n== SSO: authorize + callback (стаб-IdP) -> наш JWT ==")
ratelimit._store = ratelimit._MemoryStore()
r = client.get("/api/auth/sso/vtb/authorize")
check("authorize отдаёт url+state", r.status_code == 200 and "state" in r.json() and "idp.example.com/auth" in r.json().get("url", ""), f"{r.status_code}")
state = r.json()["state"]

# Подменяем обмен с IdP на стаб (без реального сетевого IdP).
import app.services.sso as sso_mod
sso_mod.exchange_and_profile = lambda conn, code: {"sub": "u1", "email": "ivanov@vtb.ru", "name": "Иванов"}
r = client.post("/api/auth/sso/vtb/callback", json={"code": "authcode", "state": state})
check("callback -> 200 c токеном и пользователем", r.status_code == 200 and r.json().get("token"), f"{r.status_code} {r.text[:120]}")
data = r.json() if r.status_code == 200 else {}
tok = data.get("token")
claims = _decode(tok) if tok else None
check("JWT валиден и несёт session-id (jti)", bool(claims and claims.get("jti")), f"{claims}")
check("создан/найден пользователь по email IdP", (data.get("user") or {}).get("email") == "ivanov@vtb.ru")
# Неверный state отклоняется.
r = client.post("/api/auth/sso/vtb/callback", json={"code": "x", "state": "tampered"})
check("callback с неверным state -> 400", r.status_code == 400, f"{r.status_code}")
# SAML ACS пока не активирован.
r = client.post("/api/auth/sso/vtb/acs")
check("SAML ACS -> 501 (не активирован)", r.status_code == 501, f"{r.status_code}")
r = client.get("/api/auth/sso/vtb/metadata")
check("SAML metadata отдаётся (XML)", r.status_code == 200 and "EntityDescriptor" in r.text, f"{r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки Enterprise (Блок 9) пройдены.")
