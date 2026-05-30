from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    body: Optional[str]
    data: Optional[Any]
    read: bool
    is_broadcast: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationCount(BaseModel):
    unread_count: int