from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel as PydanticBase
from app.database import get_db
from app.models.subtask import SubTask
from app.models.task import Task

router = APIRouter()


class SubTaskOut(PydanticBase):
    id: int
    task_id: int
    title: str
    completed: bool
    order_index: int

    class Config:
        from_attributes = True


class SubTaskCreate(PydanticBase):
    task_id: int
    titles: List[str]


class SubTaskUpdate(PydanticBase):
    completed: bool = None
    title: str = None


@router.post("/bulk", response_model=List[SubTaskOut])
def create_subtasks(data: SubTaskCreate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Delete existing subtasks for this task before adding new ones
    db.query(SubTask).filter(SubTask.task_id == data.task_id).delete()
    subtasks = [
        SubTask(task_id=data.task_id, title=title.strip(), order_index=i)
        for i, title in enumerate(data.titles)
        if title.strip()
    ]
    db.add_all(subtasks)
    db.commit()
    for s in subtasks:
        db.refresh(s)
    return subtasks


@router.get("/", response_model=List[SubTaskOut])
def list_subtasks(task_id: int, db: Session = Depends(get_db)):
    return db.query(SubTask).filter(SubTask.task_id == task_id).order_by(SubTask.order_index).all()


@router.patch("/{subtask_id}", response_model=SubTaskOut)
def update_subtask(subtask_id: int, data: SubTaskUpdate, db: Session = Depends(get_db)):
    s = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="SubTask not found")
    if data.completed is not None:
        s.completed = data.completed
    if data.title is not None:
        s.title = data.title
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(get_db)):
    s = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="SubTask not found")
    db.delete(s)
    db.commit()
    return {"ok": True}
