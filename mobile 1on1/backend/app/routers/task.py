from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

router = APIRouter()

@router.post("/", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/", response_model=List[TaskOut])
def list_tasks(
    assigned_to: Optional[int] = Query(None),
    team_id: Optional[int] = Query(None),
    completed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)
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

    if data.completed and not task.completed:
        task.completed_at = datetime.utcnow()

    for key, value in data.model_dump(exclude_unset=True).items():
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