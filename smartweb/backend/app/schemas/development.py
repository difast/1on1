from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.goal import GoalCommentOut, GoalOut

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)



# ── Навыки (справочник) ───────────────────────────────────────────────────────
class SkillCreate(BaseModel):
    actor_id: EntityId
    name: ShortStr
    category: ShortStr = "technical"
    team_id: OptEntityId = None


class SkillOut(BaseModel):
    id: int
    team_id: Optional[int] = None
    name: str
    category: str
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


# ── Навык сотрудника (уровни) ─────────────────────────────────────────────────
class UserSkillCreate(BaseModel):
    actor_id: EntityId
    user_id: EntityId
    skill_id: OptEntityId = None         # существующий навык из справочника…
    skill_name: OptShortStr = None       # …или новый (заведём в справочник команды)
    category: ShortStr = "technical"
    # Уровни владения навыком — шкала 1..5, как в интерфейсе развития.
    current_level: Annotated[int, Field(ge=1, le=5)] = 1
    desired_level: Optional[Annotated[int, Field(ge=1, le=5)]] = None
    target_date: Optional[datetime] = None


class UserSkillUpdate(BaseModel):
    actor_id: EntityId
    current_level: Optional[Annotated[int, Field(ge=1, le=5)]] = None
    desired_level: Optional[Annotated[int, Field(ge=1, le=5)]] = None
    target_date: Optional[datetime] = None
    note: OptTextStr = None              # заметка к изменению уровня (в историю)


class SkillHistoryOut(BaseModel):
    id: int
    level: int
    level_label: Optional[str] = None
    changed_by: Optional[int] = None
    note: Optional[str] = None
    changed_at: Optional[datetime] = None


class UserSkillOut(BaseModel):
    id: int
    user_id: int
    skill_id: int
    skill_name: Optional[str] = None
    category: str
    current_level: int
    current_level_label: Optional[str] = None
    desired_level: Optional[int] = None
    desired_level_label: Optional[str] = None
    target_date: Optional[datetime] = None
    gap: int = 0                          # desired - current (>=0)
    history: List[SkillHistoryOut] = []

    class Config:
        from_attributes = True


# ── Шаги плана развития ───────────────────────────────────────────────────────
class StepCreate(BaseModel):
    actor_id: EntityId
    user_id: EntityId                    # чей план
    title: ShortStr
    description: OptLongTextStr = None
    skill_id: OptEntityId = None
    goal_id: OptEntityId = None
    task_id: OptEntityId = None
    meeting_id: OptEntityId = None
    due_date: Optional[datetime] = None


class StepUpdate(BaseModel):
    actor_id: EntityId
    title: OptShortStr = None
    description: OptLongTextStr = None
    skill_id: OptEntityId = None
    goal_id: OptEntityId = None
    due_date: Optional[datetime] = None
    status: OptShortStr = None
    progress: Optional[Annotated[int, Field(ge=0, le=100)]] = None


class StepOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    skill_id: Optional[int] = None
    skill_name: Optional[str] = None
    goal_id: Optional[int] = None
    goal_title: Optional[str] = None
    task_id: Optional[int] = None
    meeting_id: Optional[int] = None
    due_date: Optional[datetime] = None
    status: str
    progress: int
    assigned_by: Optional[int] = None
    assigned_by_name: Optional[str] = None
    assigned_by_lead: bool = False       # назначено руководителем
    overdue: bool = False
    comments: List[GoalCommentOut] = []

    class Config:
        from_attributes = True


# ── Рекомендации ──────────────────────────────────────────────────────────────
class RecommendationCreate(BaseModel):
    # Назначение направления роста тимлидом (source=lead) или произвольная реко.
    actor_id: EntityId
    user_id: EntityId
    skill_id: OptEntityId = None
    title: ShortStr
    body: OptLongTextStr = None
    target_level: Optional[Annotated[int, Field(ge=1, le=5)]] = None
    target_date: Optional[datetime] = None


class RecommendationAction(BaseModel):
    actor_id: EntityId
    action: ShortStr                     # accept | dismiss
    note: OptTextStr = None


class RecommendationOut(BaseModel):
    id: int
    user_id: int
    skill_id: Optional[int] = None
    skill_name: Optional[str] = None
    source: str
    source_label: Optional[str] = None
    title: str
    body: Optional[str] = None
    article_id: Optional[int] = None
    target_level: Optional[int] = None
    target_date: Optional[datetime] = None
    status: str
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Агрегаты экрана «Развитие» ────────────────────────────────────────────────
class DevelopmentOut(BaseModel):
    user_id: int
    skills: List[UserSkillOut] = []
    steps: List[StepOut] = []
    recommendations: List[RecommendationOut] = []
    learning_goals: List[GoalOut] = []
    plan_progress: int = 0
