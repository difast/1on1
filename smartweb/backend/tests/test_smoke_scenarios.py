"""Дымовой прогон реальных пользовательских сценариев на ужесточённом API:
проверяем, что легитимная работа продукта не сломалась."""
import os, sys, tempfile, warnings
warnings.filterwarnings("ignore")
fd, path = tempfile.mkstemp(suffix=".sqlite"); os.close(fd)
os.environ.update(SECRET_KEY="s", JWT_SECRET="s", ADMIN_PASSWORD="pw",
                  DATABASE_URL=f"sqlite:///{path}")
sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient
import app.main as m
from app.database import Base, engine
Base.metadata.create_all(bind=engine)
c = TestClient(m.app, raise_server_exceptions=False)

fails = []
def step(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

# Регистрация -> подтверждение -> вход
r = c.post("/api/auth/register", json={"name": "Мария", "email": "maria@example.com",
                                       "password": "Parol12345"})
step("регистрация проходит", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
uid = r.json()["user"]["id"]

from app.database import SessionLocal
from app.models.user import User
db = SessionLocal(); u = db.query(User).get(uid); u.email_confirmed = True; db.commit(); db.close()

r = c.post("/api/auth/login", json={"email": "maria@example.com", "password": "Parol12345"})
step("вход проходит", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
tok = r.json()["token"]; H = {"Authorization": f"Bearer {tok}"}

# Команда
r = c.post("/api/teams/", json={"name": "Продукт", "team_lead_id": uid}, headers=H)
step("создание команды", r.status_code in (200, 201), f"{r.status_code} {r.text[:150]}")
team_id = r.json().get("id") if r.status_code < 300 else None

# Задача
r = c.post("/api/tasks/", json={"assigned_to": uid, "assigned_by": uid, "team_id": team_id,
                                "title": "Подготовить план на квартал",
                                "description": "Описание задачи с обычным текстом."}, headers=H)
step("создание задачи", r.status_code in (200, 201), f"{r.status_code} {r.text[:150]}")
task_id = r.json().get("id") if r.status_code < 300 else None

r = c.patch(f"/api/tasks/{task_id}", json={"status": "in_progress"}, headers=H)
step("обновление статуса задачи", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

# Заметка, цель, настроение
r = c.post("/api/notes/", json={"user_id": uid, "content": "Заметка по итогам встречи"}, headers=H)
step("создание заметки", r.status_code in (200, 201), f"{r.status_code} {r.text[:120]}")

r = c.post("/api/goals/", json={"user_id": uid, "title": "Вырасти до senior",
                                "description": "План на год", "team_id": team_id}, headers=H)
step("создание цели", r.status_code in (200, 201), f"{r.status_code} {r.text[:150]}")

r = c.post("/api/mood/", json={"team_id": team_id, "user_id": uid, "score": 4}, headers=H)
step("отправка настроения", r.status_code in (200, 201), f"{r.status_code} {r.text[:150]}")

# Встреча
r = c.post("/api/meetings/", json={"team_id": team_id, "team_lead_id": uid, "member_id": uid,
                                   "scheduled_date": "2026-09-01T10:00:00",
                                   "agenda": "Обсудить цели"}, headers=H)
step("создание встречи", r.status_code in (200, 201), f"{r.status_code} {r.text[:150]}")

# Списки
for path_, name in [("/api/teams/", "список команд"), (f"/api/tasks/?user_id={uid}", "список задач"),
                    (f"/api/notifications/?user_id={uid}", "список уведомлений"),
                    (f"/api/meetings/?user_id={uid}", "список встреч")]:
    r = c.get(path_, headers=H)
    step(name, r.status_code == 200, f"{r.status_code} {r.text[:100]}")

# Профиль: обновление и аватар обычного размера
r = c.patch(f"/api/users/{uid}", json={"name": "Мария Иванова", "title": "Продакт-менеджер",
                                       "avatar": "data:image/png;base64," + "A" * 60000}, headers=H)
step("обновление профиля с аватаром (60 КБ)", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

# Смена пароля
r = c.post("/api/auth/change-password", json={"user_id": uid, "current_password": "Parol12345",
                                              "new_password": "Novyy12345"}, headers=H)
step("смена пароля", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

print(f"\nПровалов: {len(fails)}")
for f in fails: print("  -", f)
os.unlink(path)
sys.exit(1 if fails else 0)
