"""Блок 2 безопасности: RBAC на ролях тимлид / участник.

Проверяем строго на существующей модели ролей (роль = отношение к команде:
тимлид владеет командой, участник состоит в ней). Три класса проверок:

  1. Действия уровня тимлида (управление составом команды, прямое создание
     встречи, командный табель) недоступны участнику -> 403.
  2. IDOR по роли ВНУТРИ одной команды: участник A1 не видит данные другого
     участника A2 той же команды (встречи, задачи, заметки, чек-ины, фиды).
  3. Тимлид видит данные участников СВОЕЙ команды, но не чужой (совместно с
     Блоком 3), и легитимные сценарии (участник -> свои данные) работают.

Запуск (SQLite в файле):
    python tests/test_rbac_roles.py
"""
import os
import sys
import tempfile
import datetime as _dt

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-assertions")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-assertions")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"
os.environ["ORG_ISOLATION_ENFORCE"] = "1"  # единый флаг строгого доступа (Блок 2+3)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team, TeamMember  # noqa: E402
from app.models.meeting import Meeting  # noqa: E402
from app.models.task import Task  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit  # noqa: E402

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


def mk_user(db, email, name, role="member"):
    u = User(name=name, email=email, role=role,
             password_hash=hash_password("Parol12345"), email_confirmed=True)
    db.add(u); db.commit(); db.refresh(u)
    return u.id


# ── Одна организация A: тимлид + два участника (A1, A2). Организация B отдельно ──
db = SessionLocal()
leadA = mk_user(db, "leadA@a.com", "Лид A", role="team_lead")
m1 = mk_user(db, "m1@a.com", "Участник A1")
m2 = mk_user(db, "m2@a.com", "Участник A2")
teamA = Team(name="A", invite_code="codeA", team_lead_id=leadA)
db.add(teamA); db.commit(); db.refresh(teamA)
teamA_id = teamA.id
db.add(TeamMember(team_id=teamA_id, user_id=leadA, role="lead"))
db.add(TeamMember(team_id=teamA_id, user_id=m1, role="member"))
db.add(TeamMember(team_id=teamA_id, user_id=m2, role="member"))
db.commit()

leadB = mk_user(db, "leadB@b.com", "Лид B", role="team_lead")
teamB = Team(name="B", invite_code="codeB", team_lead_id=leadB)
db.add(teamB); db.commit(); db.refresh(teamB)
teamB_id = teamB.id
db.add(TeamMember(team_id=teamB_id, user_id=leadB, role="lead"))
db.commit()

# Встреча 1-на-1 лида с участником m2 (m1 в ней НЕ участвует).
mtg = Meeting(team_id=teamA_id, team_lead_id=leadA, member_id=m2,
              scheduled_date=_dt.datetime.utcnow(), notes="ЛИЧНОЕ m2", status="scheduled")
db.add(mtg); db.commit(); db.refresh(mtg)
mtg_id = mtg.id

# Задача, назначенная участнику m2 (m1 не причастен).
task = Task(team_id=teamA_id, assigned_to=m2, assigned_by=leadA, title="Задача m2")
db.add(task); db.commit(); db.refresh(task)
task_id = task.id

# Личная заметка участника m2.
note = Note(user_id=m2, content="заметка m2")
db.add(note); db.commit(); db.refresh(note)
note_id = note.id
db.close()


# ═════════════════════════════════════════════════════════════════════════════
print("\n== Этап 2/4: действия уровня тимлида недоступны участнику ==")
fresh_limits()
# Участник m1 пытается управлять составом команды.
r = client.post(f"/api/teams/{teamA_id}/members?user_id={leadB}&role=member", headers=auth(m1))
check("участник добавляет члена команды -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.post(f"/api/teams/{teamA_id}/regenerate-invite", headers=auth(m1))
check("участник пересоздаёт код-приглашение -> 403", r.status_code == 403, f"код {r.status_code}")
# Участник пытается напрямую создать встречу (право тимлида).
r = client.post("/api/meetings/", json={"team_id": teamA_id, "team_lead_id": leadA,
                                        "member_id": m1, "scheduled_date": "2030-01-01T10:00:00"},
                headers=auth(m1))
check("участник создаёт встречу напрямую -> 403", r.status_code == 403, f"код {r.status_code}")
# Групповой созвон — тоже право тимлида.
r = client.post("/api/meetings/group", json={"team_id": teamA_id, "team_lead_id": leadA,
                                             "member_ids": [m1, m2], "scheduled_date": "2030-01-01T10:00:00"},
                headers=auth(m1))
check("участник назначает групповой созвон -> 403", r.status_code == 403, f"код {r.status_code}")
# Командный табель — управленческий обзор.
r = client.get(f"/api/checkins/team/{teamA_id}", headers=auth(m1))
check("участник смотрит табель всей команды -> 403", r.status_code == 403, f"код {r.status_code}")

print("\n== Этап 3: IDOR по роли ВНУТРИ команды (участник != участник) ==")
fresh_limits()
# m1 и m2 в ОДНОЙ команде, но m1 не должен видеть личные данные m2.
r = client.get(f"/api/meetings/{mtg_id}", headers=auth(m1))
check("участник видит чужую встречу коллеги -> 404", r.status_code == 404, f"код {r.status_code}")
check("тело не содержит личные заметки встречи m2", "ЛИЧНОЕ m2" not in r.text)
r = client.get(f"/api/tasks/{task_id}", headers=auth(m1))
check("участник видит чужую задачу коллеги -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/notes/?user_id={m2}", headers=auth(m1))
check("участник читает заметки коллеги -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.get(f"/api/checkins/today/{m2}", headers=auth(m1))
check("участник видит чек-ин коллеги -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.get(f"/api/interactions/?user_id={m2}", headers=auth(m1))
check("участник видит фид коллеги -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.get(f"/api/proposals/?user_id={m2}", headers=auth(m1))
check("участник видит предложения коллеги -> 403", r.status_code == 403, f"код {r.status_code}")
# Списки скоупятся по роли: m1 в списке задач команды не видит задачу m2.
r = client.get(f"/api/tasks/?team_id={teamA_id}", headers=auth(m1))
ids = {t["id"] for t in r.json()} if r.status_code == 200 else set()
check("список задач участника не содержит чужую задачу", task_id not in ids, f"видит {ids}")
r = client.get(f"/api/meetings/?team_id={teamA_id}", headers=auth(m1))
mids = {x["id"] for x in r.json()} if r.status_code == 200 else set()
check("список встреч участника не содержит чужую встречу", mtg_id not in mids, f"видит {mids}")

print("\n== Тимлид видит данные участников СВОЕЙ команды ==")
fresh_limits()
r = client.get(f"/api/meetings/{mtg_id}", headers=auth(leadA))
check("тимлид видит встречу участника своей команды -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/tasks/{task_id}", headers=auth(leadA))
check("тимлид видит задачу участника своей команды -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/checkins/today/{m2}", headers=auth(leadA))
check("тимлид видит чек-ин участника своей команды -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/checkins/team/{teamA_id}", headers=auth(leadA))
check("тимлид смотрит табель своей команды -> 200", r.status_code == 200, f"код {r.status_code}")

print("\n== Тимлид чужой команды/организации (совместно с Блоком 3) ==")
fresh_limits()
r = client.get(f"/api/meetings/{mtg_id}", headers=auth(leadB))
check("чужой тимлид видит встречу A -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/tasks/{task_id}", headers=auth(leadB))
check("чужой тимлид видит задачу A -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/checkins/today/{m2}", headers=auth(leadB))
check("чужой тимлид видит чек-ин участника A -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.post(f"/api/teams/{teamA_id}/members?user_id={leadB}&role=member", headers=auth(leadB))
check("чужой тимлид управляет составом команды A -> 403/404", r.status_code in (403, 404), f"код {r.status_code}")

print("\n== Позитивный контроль: легитимные сценарии работают ==")
fresh_limits()
r = client.get(f"/api/meetings/{mtg_id}", headers=auth(m2))
check("участник видит СВОЮ встречу -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/tasks/{task_id}", headers=auth(m2))
check("участник видит СВОЮ задачу -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/notes/?user_id={m2}", headers=auth(m2))
check("участник читает СВОИ заметки -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.post(f"/api/teams/{teamA_id}/regenerate-invite", headers=auth(leadA))
check("тимлид пересоздаёт код своей команды -> 200", r.status_code == 200, f"код {r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки RBAC (роли тимлид/участник) пройдены.")
