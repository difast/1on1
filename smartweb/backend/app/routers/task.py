from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import httpx, json
from pydantic import BaseModel as PydanticBaseModel
from app.database import get_db
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.tasks.reminders import send_new_task_notification
from app.prompts import AITUNNEL_KEY, task_ai_prompt

router = APIRouter()

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
    prompt = task_ai_prompt(data.title, role_ctx, status_label, due_ctx)
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3-5-haiku-20241022", "max_tokens": 500,
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
