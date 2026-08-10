from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel as PydanticBase
from app.database import get_db
from app.models.subtask import SubTask
from app.models.task import Task
from app.utils.auth import require_user
from app.services import tenancy

router = APIRouter()


def _assert_task_access(db: Session, current, task: Task) -> None:
    """Изоляция организации для подзадачи — по её родительской задаче."""
    if not tenancy.enforced():
        return
    uid = current.id
    involved = uid in (task.assigned_to, task.assigned_by) or \
        any(a.user_id == uid for a in (task.assignees or []))
    ok = involved
    if not ok and task.team_id is not None:
        ok = tenancy.can_access_team(db, uid, task.team_id)
    if not ok and task.team_id is None:
        ok = tenancy.can_access_user(db, uid, task.assigned_to) or \
            tenancy.can_access_user(db, uid, task.assigned_by)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")


def _load_subtask_task(db: Session, subtask: SubTask, current) -> None:
    task = db.query(Task).filter(Task.id == subtask.task_id).first()
    if task:
        _assert_task_access(db, current, task)


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
def create_subtasks(data: SubTaskCreate, db: Session = Depends(get_db),
                    current=Depends(require_user)):
    task = db.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_access(db, current, task)
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
def list_subtasks(task_id: int, db: Session = Depends(get_db),
                  current=Depends(require_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if task:
        _assert_task_access(db, current, task)
    return db.query(SubTask).filter(SubTask.task_id == task_id).order_by(SubTask.order_index).all()


@router.patch("/{subtask_id}", response_model=SubTaskOut)
def update_subtask(subtask_id: int, data: SubTaskUpdate, db: Session = Depends(get_db),
                   current=Depends(require_user)):
    s = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="SubTask not found")
    _load_subtask_task(db, s, current)
    if data.completed is not None:
        s.completed = data.completed
    if data.title is not None:
        s.title = data.title
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(get_db),
                   current=Depends(require_user)):
    s = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="SubTask not found")
    _load_subtask_task(db, s, current)
    db.delete(s)
    db.commit()
    return {"ok": True}
