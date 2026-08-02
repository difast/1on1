from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)



class ProposalCreate(BaseModel):
    from_user_id: EntityId
    to_user_id: EntityId
    proposed_time: datetime
    topic: OptTextStr = None
    team_id: OptEntityId = None


class ProposalAction(BaseModel):
    """accept / decline — действие выполняет тот, чьего ответа ждут."""
    user_id: EntityId


class ProposalCounter(BaseModel):
    """Встречное предложение другого времени (цикл переговоров)."""
    user_id: EntityId
    proposed_time: datetime
    topic: OptTextStr = None


class ProposalEventOut(BaseModel):
    id: int
    actor_id: int
    actor_name: Optional[str] = None
    action: str
    proposed_time: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProposalOut(BaseModel):
    id: int
    team_id: Optional[int]
    from_user_id: int
    from_user_name: Optional[str] = None
    to_user_id: int
    to_user_name: Optional[str] = None
    topic: Optional[str]
    proposed_time: datetime
    status: str
    awaiting_user_id: Optional[int] = None
    last_actor_id: Optional[int] = None
    meeting_id: Optional[int] = None
    created_at: Optional[datetime] = None
    events: List[ProposalEventOut] = []

    class Config:
        from_attributes = True
