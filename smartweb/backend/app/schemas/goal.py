from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class GoalCreate(BaseModel):
    user_id: int                 # владелец = автор запроса (сотрудник)
    title: str
    description: Optional[str] = None
    team_id: Optional[int] = None
    period_label: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class GoalUpdate(BaseModel):
    actor_id: int                # кто редактирует — должен быть владельцем
    title: Optional[str] = None
    description: Optional[str] = None
    period_label: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    progress: Optional[int] = None
    status: Optional[str] = None


class GoalCommentCreate(BaseModel):
    actor_id: int
    body: str
    kind: str = "comment"        # comment | feedback
    rating: Optional[int] = None  # только для feedback (1..5)


class GoalCommentOut(BaseModel):
    id: int
    author_id: int
    author_name: Optional[str] = None
    body: str
    kind: str
    rating: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GoalOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    team_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    period_label: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    progress: int
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    progress_updated_at: Optional[datetime] = None
    # Вычисляемые (только чтение): информативные подсказки, не меняют статус сами.
    suggested_status: Optional[str] = None
    stagnant: bool = False
    days_since_progress: Optional[int] = None
    comments: List[GoalCommentOut] = []

    class Config:
        from_attributes = True
