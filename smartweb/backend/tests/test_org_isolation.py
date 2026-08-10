"""Блок 3 безопасности: изоляция данных между организациями (командами).

Сценарий: две независимые организации A и B (у каждой свой тимлид и участник).
Через реальный HTTP-слой FastAPI проверяем, что пользователь организации B не
может получить/изменить данные организации A по всем ключевым категориям
(сотрудники, встречи, задачи, заметки, взаимодействия/feedback, база знаний,
AI-анализ) — даже подставив корректный id чужой сущности. Все попытки должны
отклоняться (403/404) без утечки данных.

Отдельно — сценарий Business-тарифа: один тимлид владеет ДВУМЯ командами (A1, A2)
внутри своей организации; проверяем, что он видит обе свои команды, а чужая
организация — ни одну. Это уровень ИЗОЛЯЦИИ ОРГАНИЗАЦИЙ, он не смешивается с
ролевым разграничением команд внутри организации (Блок 2).

Запуск (без внешней БД — SQLite в файле):
    python tests/test_org_isolation.py
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
# Включаем жёсткий режим изоляции организаций для этого прогона.
os.environ["ORG_ISOLATION_ENFORCE"] = "1"

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
from app.models.interaction import Interaction  # noqa: E402
from app.models.knowledge import KnowledgeArticle  # noqa: E402
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


def mk_team(db, name, lead_id, member_ids):
    t = Team(name=name, invite_code=f"code-{name}", team_lead_id=lead_id)
    db.add(t); db.commit(); db.refresh(t)
    db.add(TeamMember(team_id=t.id, user_id=lead_id, role="lead"))
    for mid in member_ids:
        db.add(TeamMember(team_id=t.id, user_id=mid, role="member"))
    db.commit()
    return t.id


# ── Данные двух организаций ───────────────────────────────────────────────────
db = SessionLocal()
# Организация A
leadA = mk_user(db, "leadA@a.com", "Лид A", role="team_lead")
memberA = mk_user(db, "memberA@a.com", "Сотрудник A")
teamA = mk_team(db, "A1", leadA, [memberA])
# Вторая команда той же организации A (Business-тариф: несколько команд у лида A)
memberA2 = mk_user(db, "memberA2@a.com", "Сотрудник A2")
teamA2 = mk_team(db, "A2", leadA, [memberA2])
# Организация B — полностью независимая
leadB = mk_user(db, "leadB@b.com", "Лид B", role="team_lead")
memberB = mk_user(db, "memberB@b.com", "Сотрудник B")
teamB = mk_team(db, "B1", leadB, [memberB])

# Сущности организации A
import datetime as _dt
mA = Meeting(team_id=teamA, team_lead_id=leadA, member_id=memberA,
             scheduled_date=_dt.datetime.utcnow(),
             notes="СЕКРЕТ A: приватные заметки встречи", agenda="повестка A")
db.add(mA); db.commit(); db.refresh(mA)
mA_id = mA.id

tA = Task(team_id=teamA, assigned_to=memberA, assigned_by=leadA,
          title="Задача A", description="секрет задачи A")
db.add(tA); db.commit(); db.refresh(tA)
tA_id = tA.id

nA = Note(user_id=memberA, content="Личная заметка сотрудника A")
db.add(nA); db.commit(); db.refresh(nA)
nA_id = nA.id

iA = Interaction(type="consultation", from_user_id=memberA, to_user_id=leadA,
                 team_id=teamA, topic="feedback A", context="контекст A", status="sent")
db.add(iA); db.commit(); db.refresh(iA)
iA_id = iA.id

kA = KnowledgeArticle(team_id=teamA, author_id=leadA, title="Статья A", content="знания A")
db.add(kA); db.commit(); db.refresh(kA)
kA_id = kA.id
db.close()


LEAK = "СЕКРЕТ A"

# ═════════════════════════════════════════════════════════════════════════════
print("\n== Категория: Сотрудники (карточка команды, профили, контакты) ==")
fresh_limits()
r = client.get(f"/api/teams/{teamA}", headers=auth(leadB))
check("чужая команда A недоступна лиду B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/teams/{teamA}", headers=auth(leadA))
check("своя команда A доступна лиду A -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/teams/by-member/{memberA}", headers=auth(leadB))
check("чужой сотрудник A недоступен через by-member -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.get("/api/teams/", headers=auth(leadB))
seen_ids = {t["id"] for t in r.json()} if r.status_code == 200 else set()
check("список команд B не содержит команд A", teamA not in seen_ids and teamA2 not in seen_ids,
      f"видит {seen_ids}")

print("\n== Категория: Встречи 1-на-1 (повестки, заметки) ==")
fresh_limits()
r = client.get(f"/api/meetings/{mA_id}", headers=auth(leadB))
check("чужая встреча A недоступна B -> 404", r.status_code == 404, f"код {r.status_code}")
check("тело ответа не содержит секрет встречи A", LEAK not in r.text)
r = client.get(f"/api/meetings/{mA_id}", headers=auth(leadA))
check("своя встреча A доступна лиду A -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.patch(f"/api/meetings/{mA_id}", json={"notes": "взлом"}, headers=auth(leadB))
check("правка чужой встречи A от B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/meetings/?team_id={teamA}", headers=auth(leadB))
check("список встреч с чужим team_id пуст для B", r.status_code == 200 and r.json() == [],
      f"код {r.status_code}, n={len(r.json()) if r.status_code==200 else '?'}")

print("\n== Категория: Задачи ==")
fresh_limits()
r = client.get(f"/api/tasks/{tA_id}", headers=auth(leadB))
check("чужая задача A недоступна B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/tasks/{tA_id}", headers=auth(leadA))
check("своя задача A доступна A -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.delete(f"/api/tasks/{tA_id}", headers=auth(leadB))
check("удаление чужой задачи A от B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/tasks/?team_id={teamA}", headers=auth(leadB))
check("список задач с чужим team_id пуст для B", r.status_code == 200 and r.json() == [],
      f"код {r.status_code}")

print("\n== Категория: Заметки / персональные записи ==")
fresh_limits()
r = client.get(f"/api/notes/?user_id={memberA}", headers=auth(leadB))
check("чужие заметки сотрудника A недоступны B -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.patch(f"/api/notes/{nA_id}", json={"content": "взлом"}, headers=auth(leadB))
check("правка чужой заметки A от B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.delete(f"/api/notes/{nA_id}", headers=auth(leadB))
check("удаление чужой заметки A от B -> 404", r.status_code == 404, f"код {r.status_code}")

print("\n== Категория: Feedback / взаимодействия ==")
fresh_limits()
r = client.get(f"/api/interactions/{iA_id}", headers=auth(leadB))
check("чужое взаимодействие A недоступно B -> 404", r.status_code == 404, f"код {r.status_code}")
r = client.get(f"/api/interactions/?user_id={memberA}", headers=auth(leadB))
check("чужой фид взаимодействий A недоступен B -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.post(f"/api/interactions/{iA_id}/accept", json={"user_id": leadA}, headers=auth(leadB))
check("принять чужое взаимодействие A от имени A из B -> 404", r.status_code == 404, f"код {r.status_code}")

print("\n== Категория: База знаний ==")
fresh_limits()
r = client.get(f"/api/knowledge/team/{teamA}", headers=auth(leadB))
check("статьи базы знаний A недоступны B -> 403", r.status_code == 403, f"код {r.status_code}")
r = client.patch(f"/api/knowledge/{kA_id}", json={"title": "взлом"}, headers=auth(leadB))
check("правка чужой статьи A от B -> 404", r.status_code == 404, f"код {r.status_code}")

print("\n== Категория: AI-анализ (ONE AI) ==")
fresh_limits()
# Лид B пытается проанализировать сотрудника чужой организации A.
r = client.post("/api/oneai/query",
                json={"actor_id": leadB, "section": "employee_analysis", "target_user_id": memberA},
                headers=auth(leadB))
check("AI-анализ чужого сотрудника A из B -> 403", r.status_code == 403, f"код {r.status_code}")
check("ответ AI не содержит секрет A", LEAK not in r.text)
# Подмена actor_id (действие от чужого имени) отклоняется.
r = client.post("/api/oneai/query",
                json={"actor_id": leadA, "section": "team_analysis", "team_id": teamA},
                headers=auth(leadB))
check("AI от чужого имени (actor_id=A, токен B) -> 403", r.status_code == 403, f"код {r.status_code}")

print("\n== Сценарий Business-тарифа: несколько команд одной организации ==")
fresh_limits()
# Лид A владеет двумя командами A1 и A2 — обе его организация, обе доступны.
r1 = client.get(f"/api/teams/{teamA}", headers=auth(leadA))
r2 = client.get(f"/api/teams/{teamA2}", headers=auth(leadA))
check("лид A видит обе свои команды A1 и A2 -> 200/200",
      r1.status_code == 200 and r2.status_code == 200, f"{r1.status_code}/{r2.status_code}")
# Лид B не видит ни одной команды организации A.
rb1 = client.get(f"/api/teams/{teamA}", headers=auth(leadB))
rb2 = client.get(f"/api/teams/{teamA2}", headers=auth(leadB))
check("лид B не видит ни A1, ни A2 -> 404/404",
      rb1.status_code == 404 and rb2.status_code == 404, f"{rb1.status_code}/{rb2.status_code}")

print("\n== Позитивный контроль: свои данные не сломаны жёстким режимом ==")
fresh_limits()
r = client.get(f"/api/notes/?user_id={memberA}", headers=auth(memberA))
check("сотрудник A видит свои заметки -> 200", r.status_code == 200, f"код {r.status_code}")
r = client.get(f"/api/meetings/?team_id={teamA}", headers=auth(leadA))
check("лид A видит встречи своей команды -> 200 и непусто",
      r.status_code == 200 and len(r.json()) >= 1, f"код {r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки изоляции организаций пройдены.")
