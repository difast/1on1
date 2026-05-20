from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TeamCreate(BaseModel):
    name: str
    team_lead_id: int

class TeamOut(BaseModel):
    id: int
    name: str
    invite_code: str
    team_lead_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class TeamMemberOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    user_title: Optional[str]
    user_avatar_url: Optional[str] = None
    telegram: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    role: str
    cadence_days: int
    last_meeting_date: Optional[datetime] = None
    status_color: str = "green"  # green, yellow, red
    is_registered: bool = True

    class Config:
        from_attributes = True

class TeamDetailOut(TeamOut):
    members: List[TeamMemberOut] = []

class JoinByCode(BaseModel):
    invite_code: str
    user_id: int