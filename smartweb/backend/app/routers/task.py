from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import httpx, json, re
from pydantic import BaseModel as PydanticBaseModel
from app.database import get_db
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.tasks.reminders import send_new_task_notification

router = APIRouter()

AITUNNEL_KEY = "sk-aitunnel-3A8F25Qme3Mnnbw8Tgg3vIWzcYxUTcku"

class TaskAIRequest(PydanticBaseModel):
    title: str
    status: Optional[str] = None
    due_date: Optional[str] = None
    role: str = "member"

@router.post("/ai-advice")
def get_task_ai_advice(data: TaskAIRequest):
    role_ctx = "тимлида" if data.role == "lead" else "участника команды"
    due_ctx = f" Срок: {data.due_date}." if data.due_date else ""
    status_map = {"in_progress": "в работе", "review": "на ревью", "blocked": "заблокирована", "done": "выполнена"}
    status_label = status_map.get(data.status or "in_progress", "в работе")
    prompt = (
        f"Ты {role_ctx} в IT-команде.\n"
        f"Задача: \"{data.title}\". Статус: {status_label}.{due_ctx}\n"
        f"Составь 4–5 конкретных последовательных шагов выполнения ИМЕННО ЭТОЙ задачи. "
        f"Категорически запрещены общие фразы вроде 'уточни требования', 'разбей на подзадачи', 'обсудись с командой' — они не несут смысла. "
        f"Каждый шаг должен прямо вытекать из названия задачи и описывать конкретное физическое или умственное действие. "
        f"Пример: задача 'Купить помидоры в Петербурге' → шаги: Забронировать билет Москва–Петербург, Найти ближайший рынок по адресу, Купить помидоры нужного сорта и количества, Упаковать товар для перевозки, Вернуться в Москву. "
        f"Начинай каждый шаг с глагола. "
        f"Ответ ТОЛЬКО JSON без каких-либо пояснений: {{\"steps\": [\"шаг 1\", \"шаг 2\", \"шаг 3\", \"шаг 4\"]}}"
    )
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 400,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=20,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip code blocks if present
        if "```" in text:
            for part in text.split("```"):
                part = part.lstrip("json").strip()
                if "{" in part:
                    text = part
                    break
        # Try regex extraction if direct parse fails
        try:
            result = json.loads(text)
        except Exception:
            m = re.search(r'\{.*?"steps"\s*:\s*(\[.*?\])', text, re.DOTALL)
            if m:
                result = {"steps": json.loads(m.group(1))}
            else:
                result = {"steps": []}
        return {"steps": result.get("steps", [])}
    except Exception:
        raise HTTPException(status_code=503, detail="AI service unavailable")

@router.post("/", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    if task.assigned_to and task.assigned_by and task.assigned_to != task.assigned_by:
        try:
            assignor = db.query(User).filter(User.id == task.assigned_by).first()
            assignor_name = assignor.name if assignor else "Тимлид"
            send_new_task_notification.delay(task.assigned_to, task.title or task.description or "Задача", assignor_name, task.id)
        except Exception:
            pass
    return task

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
        query = query.filter(Task.assigned_to == assigned_to)
    if assigned_by:
        query = query.filter(Task.assigned_by == assigned_by)
    if team_id:
        query = query.filter(Task.team_id == team_id)
    if completed is not None:
        query = query.filter(Task.completed == completed)
    return query.order_by(Task.created_at.desc()).all()

@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = data.model_dump(exclude_unset=True)

    if 'status' in updates:
        if updates['status'] == 'done':
            updates['completed'] = True
            if not task.completed:
                task.completed_at = datetime.utcnow()
        else:
            updates['completed'] = False
    elif 'completed' in updates:
        if updates['completed'] and not task.completed:
            task.completed_at = datetime.utcnow()
        updates['status'] = 'done' if updates['completed'] else 'in_progress'

    for key, value in updates.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
