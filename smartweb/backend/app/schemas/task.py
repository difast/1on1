from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TaskCreate(BaseModel):
    meeting_id: Optional[int] = None
    team_id: int
    assigned_to: int
    assigned_by: int
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None

class TaskOut(BaseModel):
    id: int
    meeting_id: Optional[int]
    team_id: int
    assigned_to: int
    assigned_by: int
    title: str
    description: Optional[str]
    due_date: Optional[datetime]
    completed: bool
    completed_at: Optional[datetime]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    completed: Optional[bool] = None
    status: Optional[str] = None