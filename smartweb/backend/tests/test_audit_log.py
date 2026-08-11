"""Блок 8: единый Audit Log, редакция чувствительных данных, мониторинг, доступ.

Проверяем:
  - redact() маскирует пароли/токены/секреты/платёжные поля рекурсивно;
  - запись значимого действия попадает в единый журнал;
  - вкладка «Логи» доступна только админу (require_admin), фильтры и пагинация;
  - неуспешный/успешный вход фиксируются в журнале (категория auth);
  - мониторинг: серия отказов помечается security-записью.

Запуск (SQLite в файле):
    python tests/test_audit_log.py
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

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.utils.auth import create_access_token, create_admin_token  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit  # noqa: E402
from app.services import audit  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def fresh_limits():
    ratelimit._store = ratelimit._MemoryStore()


def admin_auth():
    return {"Authorization": f"Bearer {create_admin_token()}"}


def user_auth(uid):
    return {"Authorization": f"Bearer {create_access_token(uid)}"}


print("\n== Редакция чувствительных данных (Этап 3) ==")
raw = {
    "password": "hunter2",
    "password_hash": "$2b$12$abcdef",
    "access_token": "eyJhbGciOi...",
    "refresh_token": "rt_secret",
    "api_key": "sk-live-123",
    "webhook_secret": "whsec_x",
    "card": "4111111111111111",
    "cvv": "123",
    "authorization": "Bearer zzz",
    "nested": {"otp": "999000", "note": "ok", "code_verifier": "verifiersecret"},
    "list": [{"token": "t1"}, {"safe": "yes"}],
    "plan_code": "team",  # безопасное поле остаётся
}
red = audit.redact(raw)
import json as _json
flat = _json.dumps(red, ensure_ascii=False)
for secret in ("hunter2", "$2b$12$abcdef", "eyJhbGciOi", "rt_secret", "sk-live-123",
               "whsec_x", "4111111111111111", "Bearer zzz", "999000", "verifiersecret", "t1"):
    check(f"секрет '{secret[:14]}' замаскирован", secret not in flat, f"утёк в {flat[:120]}")
check("безопасное поле plan_code сохранено", red.get("plan_code") == "team")
check("безопасное вложенное поле note сохранено", red["nested"]["note"] == "ok")


print("\n== Запись значимого действия в единый журнал ==")
db = SessionLocal()
before = db.query(AuditLog).count()
audit.record(db, "task.status_changed", actor_id=1, entity_type="task", entity_id=10,
             organization_id=5, category="general", summary="тест",
             meta={"from": "in_progress", "to": "done", "password": "leak"})
after = db.query(AuditLog).count()
check("запись добавлена в журнал", after == before + 1)
row = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
check("meta записи не содержит пароль", "leak" not in _json.dumps(row.meta or {}))
check("категория и действие сохранены", row.category == "general" and row.action_type == "task.status_changed")
db.close()


print("\n== Доступ к вкладке «Логи»: только админ ==")
fresh_limits()
db = SessionLocal()
u = User(name="Обычный", email="plain@a.com", role="member",
         password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(u); db.commit(); db.refresh(u)
uid = u.id
db.close()
r = client.get("/api/admin/audit/", headers=user_auth(uid))
check("обычный пользователь -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.get("/api/admin/audit/")
check("без токена -> 401/403", r.status_code in (401, 403), f"код {r.status_code}")
r = client.get("/api/admin/audit/", headers=admin_auth())
check("админ получает список -> 200", r.status_code == 200, f"код {r.status_code}")
body = r.json() if r.status_code == 200 else {}
check("ответ содержит items/total/пагинацию", all(k in body for k in ("items", "total", "limit", "offset")))


print("\n== Фильтры и пагинация ==")
fresh_limits()
r = client.get("/api/admin/audit/?category=general&limit=1", headers=admin_auth())
check("фильтр по категории + limit=1 работает", r.status_code == 200 and len(r.json()["items"]) <= 1,
      f"код {r.status_code}")
r = client.get("/api/admin/audit/?action_type=task.status_changed", headers=admin_auth())
ok = r.status_code == 200 and all(i["action_type"] == "task.status_changed" for i in r.json()["items"])
check("фильтр по типу действия работает", ok, f"код {r.status_code}")


print("\n== Вход фиксируется в журнале (категория auth) ==")
fresh_limits()
db = SessionLocal()
lu = User(name="Логин", email="log@a.com", role="member",
          password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(lu); db.commit()
db.close()
# Неуспешный вход.
r = client.post("/api/auth/login", json={"email": "log@a.com", "password": "wrong-pass"})
check("неуспешный вход -> 401", r.status_code == 401, f"код {r.status_code}")
# Успешный вход.
r = client.post("/api/auth/login", json={"email": "log@a.com", "password": "Parol12345"})
check("успешный вход -> 200", r.status_code == 200, f"код {r.status_code}")
db = SessionLocal()
auth_rows = db.query(AuditLog).filter(AuditLog.category == "auth").all()
actions = {a.action_type for a in auth_rows}
check("зафиксирован auth.login_failed", "auth.login_failed" in actions, f"{actions}")
check("зафиксирован auth.login_success", "auth.login_success" in actions, f"{actions}")
# Пароль не должен встречаться ни в summary, ни в meta записей входа.
leak = any(("wrong-pass" in (a.summary or "")) or ("Parol12345" in _json.dumps(a.meta or {}))
           for a in auth_rows)
check("пароль не попал в записи входа", not leak)
db.close()


print("\n== Мониторинг подозрительной активности (Этап 4) ==")
fresh_limits()
db = SessionLocal()
before_sec = db.query(AuditLog).filter(AuditLog.category == "security").count()
# Симулируем серию отказов от одного ключа -> должна появиться security-запись.
for _ in range(12):
    audit.note_failure(db, status_code=403, actor_id=999, ip="203.0.113.9", path="/api/tasks/1")
after_sec = db.query(AuditLog).filter(AuditLog.category == "security").count()
check("серия 403 создала security-запись", after_sec > before_sec, f"{before_sec}->{after_sec}")
sec = db.query(AuditLog).filter(AuditLog.category == "security").order_by(AuditLog.id.desc()).first()
check("security-запись помечена верной категорией", sec is not None and sec.category == "security")
db.close()
r = client.get("/api/admin/audit/security-summary", headers=admin_auth())
check("сводка безопасности доступна админу -> 200", r.status_code == 200, f"код {r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки Audit Log пройдены.")
