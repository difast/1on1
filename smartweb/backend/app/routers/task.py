from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime
import httpx, json
from pydantic import BaseModel as PydanticBaseModel
from app.database import get_db
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.schemas.task import (
    TaskCreate, TaskOut, TaskUpdate, AssigneeStatusUpdate,
)
from app.tasks.reminders import send_new_task_notification
from app.prompts import AITUNNEL_KEY, task_ai_prompt
from app.services import entitlements

router = APIRouter()

DONE = "done"


# ── serialization ────────────────────────────────────────────────────────────

def _serialize(task: Task) -> dict:
    """Собрать TaskOut c назначениями, сводным прогрессом и признаком совместной
    задачи. У обычных задач (один ответственный) assignees пуст, progress = None."""
    assignees = []
    for a in (task.assignees or []):
        assignees.append({
            "id": a.id,
            "user_id": a.user_id,
            "part_description": a.part_description,
            "status": a.status,
            "completed": a.completed,
            "completed_at": a.completed_at,
            "user_name": a.user.name if a.user else None,
        })
    is_multi = len(assignees) > 0
    progress = None
    if is_multi:
        total = len(assignees)
        done = sum(1 for a in assignees if a["completed"])
        progress = {"done": done, "total": total, "percent": round(done * 100 / total) if total else 0}
    return {
        "id": task.id,
        "meeting_id": task.meeting_id,
        "team_id": task.team_id,
        "assigned_to": task.assigned_to,
        "assigned_by": task.assigned_by,
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date,
        "completed": task.completed,
        "completed_at": task.completed_at,
        "status": task.status,
        "created_at": task.created_at,
        "assignees": assignees,
        "progress": progress,
        "is_multi": is_multi,
    }


def _apply_status(obj, status: str):
    """Единая логика статус→completed/completed_at для задачи и назначения."""
    if status == DONE:
        if not obj.completed:
            obj.completed_at = datetime.utcnow()
        obj.completed = True
    else:
        obj.completed = False
    obj.status = status


def _recompute_task_from_assignees(task: Task):
    """Свести статус задачи по статусам участников: задача выполнена, когда ВСЕ
    участники отметили свою часть готовой."""
    if not task.assignees:
        return
    all_done = all(a.completed for a in task.assignees)
    if all_done:
        if not task.completed:
            task.completed_at = datetime.utcnow()
        task.completed = True
        task.status = DONE
    else:
        task.completed = False
        # Не «готово» на уровне задачи, пока не все закрыли часть.
        if task.status == DONE:
            task.status = "in_progress"


# ── AI advice (декомпозиция задач) ───────────────────────────────────────────

class TaskAIRequest(PydanticBaseModel):
    title: str
    status: Optional[str] = None
    due_date: Optional[str] = None
    role: str = "member"
    user_id: Optional[int] = None


@router.post("/ai-advice")
def get_task_ai_advice(data: TaskAIRequest, db: Session = Depends(get_db)):
    # Тарифное ограничение (Задача 3): AI-декомпозиция доступна не на всех тарифах.
    # Если функция недоступна — вернём мягкое 402 feature_locked (фронт покажет
    # понятное сообщение со ссылкой на тарифы), а не техническую ошибку.
    if data.user_id is not None:
        user = db.query(User).filter(User.id == data.user_id).first()
        entitlements.require_feature(db, user, "ai_decomposition")

    role_ctx = "тимлида" if data.role == "lead" else "участника команды"
    due_ctx = f" Срок: {data.due_date}." if data.due_date else ""
    status_map = {"in_progress": "в работе", "review": "на ревью", "blocked": "заблокирована", "done": "выполнена"}
    status_label = status_map.get(data.status or "in_progress", "в работе")
    prompt = task_ai_prompt(data.title, role_ctx, status_label, due_ctx)
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": 500,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=25,
        )
        raw_body = resp.json()
        if "choices" not in raw_body:
            raise ValueError(f"no choices: {raw_body}")
        raw = raw_body["choices"][0]["message"]["content"]

        # Strategy 1: find balanced JSON object
        start = raw.find('{')
        if start != -1:
            depth, end = 0, -1
            for i in range(start, len(raw)):
                if raw[i] == '{': depth += 1
                elif raw[i] == '}':
                    depth -= 1
                    if depth == 0: end = i; break
            if end != -1:
                try:
                    obj = json.loads(raw[start:end + 1])
                    if obj.get("steps"):
                        return {"steps": obj["steps"]}
                except Exception:
                    pass

        # Strategy 2: numbered lines as steps
        lines = [l.strip().lstrip("0123456789.-) ") for l in raw.splitlines() if l.strip()]
        steps = [l for l in lines if len(l) > 10 and not l.startswith('{') and not l.startswith('"steps')]
        if steps:
            return {"steps": steps[:5]}

        raise ValueError("could not extract steps")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    assignees_in = payload.pop("assignees", None) or []

    task = Task(**payload)
    db.add(task)
    db.flush()  # получить task.id в рамках той же транзакции

    # Совместная задача: создаём назначения. assigned_to уже = первому участнику
    # (клиент это гарантирует), поэтому обычная логика «моих задач» продолжает
    # работать. Дедупликация участников на всякий случай.
    seen = set()
    for a in assignees_in:
        if a["user_id"] in seen:
            continue
        seen.add(a["user_id"])
        db.add(TaskAssignee(
            task_id=task.id,
            user_id=a["user_id"],
            part_description=(a.get("part_description") or None),
        ))

    db.commit()
    db.refresh(task)

    assigner = db.query(User).filter(User.id == task.assigned_by).first()
    assigner_name = assigner.name if assigner else "Тимлид"

    if task.assignees:
        # Каждый участник получает уведомление ТОЛЬКО о своей части (не спамим всех).
        for a in task.assignees:
            if a.user_id == task.assigned_by:
                continue
            part = f" — {a.part_description}" if a.part_description else ""
            try:
                send_new_task_notification.delay(
                    a.user_id, f"{task.title}{part}", assigner_name, task.id
                )
            except Exception:
                pass
    else:
        # Обычная задача с одним ответственным — прежнее поведение без изменений.
        if task.assigned_to and task.assigned_by and task.assigned_to != task.assigned_by:
            try:
                send_new_task_notification.delay(
                    task.assigned_to, task.title or task.description or "Задача",
                    assigner_name, task.id,
                )
            except Exception:
                pass

    return _serialize(task)


@router.get("/", response_model=List[TaskOut])
def list_tasks(
    assigned_to: Optional[int] = Query(None),
    assigned_by: Optional[int] = Query(None),
    team_id: Optional[int] = Query(None),
    completed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if assigned_to:
        # Совместная задача: участник видит задачу, даже если он не «первый»
        # ответственный — через членство в task_assignees.
        sub = db.query(TaskAssignee.task_id).filter(TaskAssignee.user_id == assigned_to)
        query = query.filter(or_(Task.assigned_to == assigned_to, Task.id.in_(sub)))
    if assigned_by:
        query = query.filter(Task.assigned_by == assigned_by)
    if team_id:
        query = query.filter(Task.team_id == team_id)
    if completed is not None:
        query = query.filter(Task.completed == completed)
    tasks = query.order_by(Task.created_at.desc()).all()
    return [_serialize(t) for t in tasks]


def _today_start():
    return datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/closed-today/{user_id}", response_model=List[TaskOut])
def closed_today(user_id: int, db: Session = Depends(get_db)):
    """Задачи, закрытые СЕГОДНЯ (Задача 2), с учётом роли:
      - участник — свои закрытые сегодня;
      - тимлид — закрытые сегодня по всем участникам его команд (суммарно).
    """
    start = _today_start()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "team_lead":
        from app.models.team import Team, TeamMember
        team_ids = [t.id for t in db.query(Team).filter(Team.team_lead_id == user_id).all()]
        member_ids = set()
        if team_ids:
            for tm in db.query(TeamMember).filter(TeamMember.team_id.in_(team_ids)).all():
                member_ids.add(tm.user_id)
        member_ids.discard(user_id)  # считаем участников, не самого лида
        if not member_ids:
            return []
        tasks = (
            db.query(Task)
            .filter(
                Task.assigned_to.in_(member_ids),
                Task.completed == True,  # noqa: E712
                Task.completed_at >= start,
            )
            .order_by(Task.completed_at.desc())
            .all()
        )
    else:
        tasks = (
            db.query(Task)
            .filter(
                Task.assigned_to == user_id,
                Task.completed == True,  # noqa: E712
                Task.completed_at >= start,
            )
            .order_by(Task.completed_at.desc())
            .all()
        )
    return [_serialize(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _serialize(task)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = data.model_dump(exclude_unset=True)

    # Прямое изменение статуса задачи (обычные задачи с одним ответственным).
    if 'status' in updates:
        _apply_status(task, updates.pop('status'))
    elif 'completed' in updates:
        completed = updates.pop('completed')
        _apply_status(task, DONE if completed else "in_progress")

    for key, value in updates.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return _serialize(task)


@router.patch("/assignee/{assignee_id}", response_model=TaskOut)
def update_assignee(assignee_id: int, data: AssigneeStatusUpdate, db: Session = Depends(get_db)):
    """Обновить статус/описание части ОДНОГО участника совместной задачи и
    пересчитать сводный статус задачи. Уведомления по чужим частям не шлём."""
    a = db.query(TaskAssignee).filter(TaskAssignee.id == assignee_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignee not found")
    if data.status is not None:
        _apply_status(a, data.status)
    if data.part_description is not None:
        a.part_description = data.part_description or None
    db.flush()
    task = db.query(Task).filter(Task.id == a.task_id).first()
    if task:
        db.refresh(task)
        _recompute_task_from_assignees(task)
    db.commit()
    db.refresh(task)
    return _serialize(task)


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
