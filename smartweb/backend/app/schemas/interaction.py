from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)



class InteractionCreate(BaseModel):
    type: ShortStr  # collab_proposal | help_offer | consultation | discussion | recommendation
    from_user_id: EntityId
    to_user_id: OptEntityId = None            # основной получатель (1:1 типы)
    # Число приглашённых ограничено: иначе одно обсуждение создаёт неограниченное
    # количество участников и уведомлений.
    participant_ids: Optional[Annotated[List[EntityId], Field(max_length=200)]] = None
    subject_user_id: OptEntityId = None       # рекомендация: кого рекомендуют
    team_id: OptEntityId = None
    task_id: OptEntityId = None
    topic: OptTextStr = None
    context: OptLongTextStr = None
    desired_format: OptShortStr = None         # consultation: text | call
    expires_at: Optional[datetime] = None


class InteractionAction(BaseModel):
    user_id: EntityId


class InteractionReplyIn(BaseModel):
    user_id: EntityId
    body: TextStr


class InteractionClose(BaseModel):
    user_id: EntityId
    outcome: OptShortStr = None  # discussion: decision | needs_meeting | closed


class ReplyOut(BaseModel):
    id: int
    author_id: int
    author_name: Optional[str] = None
    body: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ParticipantOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    role: str

    class Config:
        from_attributes = True


class InteractionOut(BaseModel):
    id: int
    type: str
    from_user_id: int
    from_user_name: Optional[str] = None
    to_user_id: Optional[int] = None
    to_user_name: Optional[str] = None
    subject_user_id: Optional[int] = None
    subject_user_name: Optional[str] = None
    team_id: Optional[int] = None
    task_id: Optional[int] = None
    meeting_id: Optional[int] = None
    topic: Optional[str] = None
    context: Optional[str] = None
    desired_format: Optional[str] = None
    status: str
    outcome: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    participants: List[ParticipantOut] = []
    replies: List[ReplyOut] = []

    class Config:
        from_attributes = True
