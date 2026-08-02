from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.utils.validation import (
    NameStr, OptNameStr, ShortStr, OptShortStr, TextStr, OptTextStr,
    LongTextStr, OptLongTextStr, EntityId, OptEntityId,
)
from typing import Annotated
from pydantic import Field



class AssigneeIn(BaseModel):
    user_id: EntityId
    part_description: OptTextStr = None


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
    meeting_id: OptEntityId = None
    team_id: OptEntityId = None
    assigned_to: EntityId
    assigned_by: EntityId
    title: ShortStr
    description: OptLongTextStr = None
    due_date: Optional[datetime] = None
    # Совместная задача (Задача 4): несколько ответственных со своими частями.
    # Если не передано — обычная задача с одним ответственным (обратная совместимость).
    assignees: Optional[Annotated[List[AssigneeIn], Field(max_length=100)]] = None


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
    title: OptShortStr = None
    description: OptLongTextStr = None
    due_date: Optional[datetime] = None
    completed: Optional[bool] = None
    status: OptShortStr = None


class AssigneeStatusUpdate(BaseModel):
    status: OptShortStr = None
    part_description: OptTextStr = None
