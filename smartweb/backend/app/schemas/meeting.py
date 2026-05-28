from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MeetingCreate(BaseModel):
    team_id: int
    team_lead_id: int
    member_id: int
    scheduled_date: datetime
    agenda: Optional[str] = None

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
    created_at: datetime

    class Config:
        from_attributes = True

class MeetingUpdate(BaseModel):
    status: Optional[str] = None
    mood: Optional[str] = None
    notes: Optional[str] = None
    agenda: Optional[str] = None
    call_duration_seconds: Optional[int] = None
    call_analytics: Optional[str] = None

class MeetingRequest(BaseModel):
    member_id: int
    team_lead_id: Optional[int] = None
    team_id: int
    scheduled_date: datetime
    topic: Optional[str] = None

class SlotProposal(BaseModel):
    start: datetime
    end: datetime

class ScheduleRequest(BaseModel):
    team_lead_id: int
    member_id: int
    days_ahead: int = 7

class ScheduleResponse(BaseModel):
    proposed_slots: List[SlotProposal]
