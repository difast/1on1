from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class AssigneeIn(BaseModel):
    user_id: int
    part_description: Optional[str] = None


class AssigneeOut(BaseModel):
    id: int
    user_id: int
    part_description: Optional[str] = None
    status: str
    completed: bool
    completed_at: Optional[datetime] = None
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class ProgressOut(BaseModel):
    done: int
    total: int
    percent: int


class TaskCreate(BaseModel):
    meeting_id: Optional[int] = None
    team_id: Optional[int] = None
    assigned_to: int
    assigned_by: int
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    # Совместная задача (Задача 4): несколько ответственных со своими частями.
    # Если не передано — обычная задача с одним ответственным (обратная совместимость).
    assignees: Optional[List[AssigneeIn]] = None


class TaskOut(BaseModel):
    id: int
    meeting_id: Optional[int]
    team_id: Optional[int]
    assigned_to: int
    assigned_by: int
    title: str
    description: Optional[str]
    due_date: Optional[datetime]
    completed: bool
    completed_at: Optional[datetime]
    status: str
    created_at: datetime
    # Пусто/None у обычных задач с одним ответственным.
    assignees: List[AssigneeOut] = []
    progress: Optional[ProgressOut] = None
    is_multi: bool = False

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    completed: Optional[bool] = None
    status: Optional[str] = None


class AssigneeStatusUpdate(BaseModel):
    status: Optional[str] = None
    part_description: Optional[str] = None
