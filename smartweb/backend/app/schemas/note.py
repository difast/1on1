from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.utils.validation import (
    NameStr, OptNameStr, ShortStr, OptShortStr, TextStr, OptTextStr,
    LongTextStr, OptLongTextStr, EntityId, OptEntityId,
)



class NoteCreate(BaseModel):
    user_id: EntityId
    content: LongTextStr
    meeting_id: OptEntityId = None


class NoteUpdate(BaseModel):
    content: LongTextStr


class NoteOut(BaseModel):
    id: int
    user_id: int
    meeting_id: Optional[int]
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
