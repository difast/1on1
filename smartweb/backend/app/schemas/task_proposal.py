from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)



class TaskProposalCreate(BaseModel):
    from_user_id: EntityId
    to_user_id: EntityId
    title: ShortStr
    description: OptLongTextStr = None
    due_date: Optional[datetime] = None
    team_id: OptEntityId = None


class TaskProposalAction(BaseModel):
    """accept / decline — выполняет получатель предложения."""
    user_id: EntityId


class TaskProposalComment(BaseModel):
    """Комментарий в обсуждении предложения (обе стороны)."""
    user_id: EntityId
    note: TextStr


class TaskProposalEventOut(BaseModel):
    id: int
    actor_id: int
    actor_name: Optional[str] = None
    action: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskProposalOut(BaseModel):
    id: int
    team_id: Optional[int]
    from_user_id: int
    from_user_name: Optional[str] = None
    to_user_id: int
    to_user_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    status: str
    task_id: Optional[int] = None
    created_at: Optional[datetime] = None
    events: List[TaskProposalEventOut] = []

    class Config:
        from_attributes = True
