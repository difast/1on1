from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.utils.validation import (
    NameStr, OptNameStr, ShortStr, OptShortStr, TextStr, OptTextStr,
    LongTextStr, OptLongTextStr, EntityId, OptEntityId,
)
from typing import Annotated
from pydantic import Field



class MeetingCreate(BaseModel):
    team_id: EntityId
    team_lead_id: EntityId
    member_id: EntityId
    scheduled_date: datetime
    agenda: OptLongTextStr = None


class GroupMeetingCreate(BaseModel):
    """Групповой созвон (Задача 4): несколько участников или вся команда."""
    team_id: EntityId
    team_lead_id: EntityId
    scheduled_date: datetime
    agenda: OptLongTextStr = None
    # Список участников ограничен сверху: без границы запрос со ста тысячами
    # идентификаторов породил бы столько же записей и уведомлений.
    member_ids: Optional[Annotated[List[EntityId], Field(max_length=200)]] = None
    whole_team: bool = False                 # вся команда (кроме тимлида)

class MeetingOut(BaseModel):
    id: int
    team_id: int
    team_lead_id: int
    member_id: int
    scheduled_date: datetime
    status: str
    mood: Optional[str]
    notes: Optional[str]
    agenda: Optional[str]
    context_from_last: Optional[str]
    jitsi_room_url: Optional[str] = None
    jitsi_room_name: Optional[str] = None
    call_transcript: Optional[str] = None
    ai_summary: Optional[str] = None
    call_duration_seconds: Optional[int] = None
    call_analytics: Optional[str] = None
    is_rescheduled: bool = False
    group_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class MeetingUpdate(BaseModel):
    status: OptShortStr = None
    mood: OptShortStr = None
    notes: OptLongTextStr = None
    agenda: OptLongTextStr = None
    # Длительность звонка: сутки с запасом. Отрицательные и абсурдные значения
    # ломали бы аналитику по средней длительности.
    call_duration_seconds: Optional[Annotated[int, Field(ge=0, le=86400)]] = None
    call_analytics: OptLongTextStr = None
    scheduled_date: Optional[datetime] = None
    is_rescheduled: Optional[bool] = None

class MeetingRequest(BaseModel):
    member_id: EntityId
    team_lead_id: OptEntityId = None
    team_id: EntityId
    scheduled_date: datetime
    topic: OptTextStr = None

class SlotProposal(BaseModel):
    start: datetime
    end: datetime

class ScheduleRequest(BaseModel):
    team_lead_id: EntityId
    member_id: EntityId
    # Горизонт подбора слотов: перебор по дням, поэтому потолок обязателен.
    days_ahead: Annotated[int, Field(ge=1, le=90)] = 7

class ScheduleResponse(BaseModel):
    proposed_slots: List[SlotProposal]
