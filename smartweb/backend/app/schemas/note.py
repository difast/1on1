from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NoteCreate(BaseModel):
    user_id: int
    content: str
    meeting_id: Optional[int] = None


class NoteUpdate(BaseModel):
    content: str


class NoteOut(BaseModel):
    id: int
    user_id: int
    meeting_id: Optional[int]
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
