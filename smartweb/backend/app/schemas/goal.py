from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)



class GoalCreate(BaseModel):
    user_id: EntityId            # владелец = автор запроса (сотрудник или тимлид)
    title: ShortStr
    description: OptLongTextStr = None
    team_id: OptEntityId = None
    scope: ShortStr = "personal"      # personal | team (team ставит только тимлид)
    goal_kind: ShortStr = "standard"  # standard | learning (учебная цель модуля «Развитие»)
    skill_id: OptEntityId = None  # связь с навыком развития
    period_label: OptShortStr = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class GoalUpdate(BaseModel):
    actor_id: EntityId           # кто редактирует — должен быть владельцем
    title: OptShortStr = None
    description: OptLongTextStr = None
    period_label: OptShortStr = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    # Прогресс — проценты; вне 0..100 ломает полосу выполнения в интерфейсе.
    progress: Optional[Annotated[int, Field(ge=0, le=100)]] = None
    status: OptShortStr = None
    skill_id: OptEntityId = None


class GoalCommentCreate(BaseModel):
    actor_id: EntityId
    body: TextStr
    kind: ShortStr = "comment"   # comment | feedback
    rating: Optional[Annotated[int, Field(ge=1, le=5)]] = None  # только для feedback


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
    scope: str = "personal"
    goal_kind: str = "standard"
    skill_id: Optional[int] = None
    skill_name: Optional[str] = None
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
