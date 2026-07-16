from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "member"
    title: Optional[str] = None
    telegram: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None

class UserOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    role: str
    title: Optional[str]
    telegram: Optional[str]
    telegram_id: Optional[int] = None
    linkedin: Optional[str]
    github: Optional[str]
    avatar: Optional[str]
    is_blocked: bool = False
    detected_region: Optional[str] = None
    preferred_language: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    title: Optional[str] = None
    telegram: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    avatar: Optional[str] = None
    push_token: Optional[str] = None
    # Язык интерфейса — сохраняется после ручного выбора, чтобы не определять
    # заново при каждом визите (Этап 6).
    preferred_language: Optional[str] = None
