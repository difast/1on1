from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.goal import Goal, GoalComment, GOAL_STATUSES, GOAL_OPEN_STATUSES, GOAL_SCOPES
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalUpdate, GoalCommentCreate, GoalOut
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService

router = APIRouter()

STAGNATION_DAYS = 14


# ── helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, uid: Optional[int]) -> Optional[str]:
    if not uid:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else None


def _skill_name(db: Session, skill_id: Optional[int]) -> Optional[str]:
    if not skill_id:
        return None
    from app.models.development import Skill
    s = db.query(Skill).filter(Skill.id == skill_id).first()
    return s.name if s else None


def _leads_of_user(db: Session, owner_id: int) -> set:
    """Тимлиды команд, в которых состоит владелец цели."""
    team_ids = [tm.team_id for tm in db.query(TeamMember).filter(TeamMember.user_id == owner_id).all()]
    leads = set()
    if team_ids:
        for t in db.query(Team).filter(Team.id.in_(team_ids)).all():
            if t.team_lead_id:
                leads.add(t.team_lead_id)
    return leads


def _is_lead_of(db: Session, actor_id: int, owner_id: int) -> bool:
    return actor_id in _leads_of_user(db, owner_id)


def _team_member_ids(db: Session, team_id: int) -> list:
    """Участники команды (без тимлида) — для рассылки уведомлений."""
    team = db.query(Team).filter(Team.id == team_id).first()
    lead_id = team.team_lead_id if team else None
    return [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
            if tm.user_id != lead_id]


def _is_team_lead(db: Session, actor_id: int, team_id: int) -> bool:
    team = db.query(Team).filter(Team.id == team_id).first()
    return bool(team and team.team_lead_id == actor_id)


def _can_view_team(db: Session, actor_id: int, team_id: int) -> bool:
    """Командную цель видит тимлид команды и любой её участник."""
    if _is_team_lead(db, actor_id, team_id):
        return True
    return db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == actor_id
    ).first() is not None


def _can_view_goal(db: Session, actor_id: int, goal: Goal) -> bool:
    """Видимость цели: личную видит владелец и тимлид его команды; командную —
    тимлид команды и любой её участник."""
    if getattr(goal, "scope", "personal") == "team":
        return bool(goal.team_id and _can_view_team(db, actor_id, goal.team_id))
    return actor_id == goal.user_id or _is_lead_of(db, actor_id, goal.user_id)


def _enforce_actor(current, actor_id: int):
    """Если пришёл валидный токен — actor_id не должен подменяться (анти-спуфинг),
    как в остальных приватных эндпоинтах."""
    if current is not None and current.id != actor_id:
        raise HTTPException(status_code=403, detail="Доступ только от своего имени")


def _suggest_status(goal: Goal, now: datetime) -> str:
    """Информативная подсказка статуса по прогрессу и времени периода. НЕ меняет
    статус сама — финальное решение за сотрудником."""
    p = goal.progress or 0
    if p >= 100:
        return "achieved"
    if goal.status in ("achieved", "failed"):
        return goal.status
    ps, pe = goal.period_start, goal.period_end
    if pe and now > pe and p < 100:
        return "at_risk"
    if ps and pe and pe > ps:
        total = (pe - ps).total_seconds()
        elapsed = max(0.0, min(1.0, (now - ps).total_seconds() / total)) if total > 0 else 0
        if elapsed - (p / 100.0) > 0.25:  # заметно позади графика
            return "at_risk"
    if p == 0:
        return "not_started"
    return "in_progress"


def _serialize(db: Session, goal: Goal, with_comments: bool = True) -> dict:
    now = datetime.utcnow()
    days_since = (now - goal.progress_updated_at).days if goal.progress_updated_at else None
    stagnant = bool(
        goal.status in GOAL_OPEN_STATUSES and days_since is not None and days_since >= STAGNATION_DAYS
    )
    data = {
        "id": goal.id,
        "user_id": goal.user_id,
        "user_name": _name(db, goal.user_id),
        "team_id": goal.team_id,
        "scope": getattr(goal, "scope", "personal") or "personal",
        "goal_kind": getattr(goal, "goal_kind", "standard") or "standard",
        "skill_id": getattr(goal, "skill_id", None),
        "skill_name": _skill_name(db, getattr(goal, "skill_id", None)),
        "title": goal.title,
        "description": goal.description,
        "period_label": goal.period_label,
        "period_start": goal.period_start,
        "period_end": goal.period_end,
        "progress": goal.progress,
        "status": goal.status,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        "progress_updated_at": goal.progress_updated_at,
        "suggested_status": _suggest_status(goal, now),
        "stagnant": stagnant,
        "days_since_progress": days_since,
        "comments": [],
    }
    if with_comments:
        names = {c.author_id: _name(db, c.author_id) for c in goal.comments}
        data["comments"] = [
            {
                "id": c.id, "author_id": c.author_id, "author_name": names.get(c.author_id),
                "body": c.body, "kind": c.kind, "rating": c.rating, "created_at": c.created_at,
            }
            for c in goal.comments
        ]
    return data


def _apply_status_progress(goal: Goal, status: Optional[str], progress: Optional[int], now: datetime):
    """Единые правила связки статуса и прогресса (нельзя «достигнута» при неполном
    прогрессе; «не начата» = 0). Нормализация учитывает НАМЕРЕНИЕ: явно
    выставленный статус приоритетнее; если сотрудник поменял только прогресс —
    статус подстраивается под него."""
    status_provided = status is not None
    progress_provided = progress is not None
    if status_provided:
        if status not in GOAL_STATUSES:
            raise HTTPException(status_code=400, detail="Некорректный статус")
        goal.status = status
    if progress_provided:
        goal.progress = max(0, min(100, int(progress)))
        goal.progress_updated_at = now

    if status_provided and goal.status == "achieved":
        goal.progress = 100                 # «достигнута» = выполнено полностью
    elif status_provided and goal.status == "not_started":
        goal.progress = 0
    elif progress_provided:
        # Меняли только прогресс: не даём остаться «достигнута» при неполном.
        if goal.progress < 100 and goal.status == "achieved":
            goal.status = "in_progress"


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=GoalOut)
def create_goal(data: GoalCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Создать цель.
    personal — владелец = автор (сотрудник создаёт СВОИ цели);
    team     — командную цель ставит ТОЛЬКО тимлид своей команды (владелец = тимлид)."""
    _enforce_actor(current, data.user_id)
    if not (data.title or "").strip():
        raise HTTPException(status_code=400, detail="Укажите название цели")

    scope = data.scope if data.scope in GOAL_SCOPES else "personal"
    team_id = data.team_id

    if scope == "team":
        # Командную цель может завести только тимлид указанной команды.
        if not team_id:
            raise HTTPException(status_code=400, detail="Для командной цели укажите команду")
        if not _is_team_lead(db, data.user_id, team_id):
            raise HTTPException(status_code=403, detail="Командную цель ставит тимлид команды")
    else:
        # team_id по умолчанию — команда сотрудника (для видимости тимлиду).
        if team_id is None:
            tm = db.query(TeamMember).filter(TeamMember.user_id == data.user_id).first()
            team_id = tm.team_id if tm else None

    goal = Goal(
        user_id=data.user_id,
        team_id=team_id,
        scope=scope,
        goal_kind=("learning" if data.goal_kind == "learning" else "standard"),
        skill_id=data.skill_id,
        title=data.title.strip(),
        description=(data.description or None),
        period_label=data.period_label,
        period_start=data.period_start,
        period_end=data.period_end,
        progress=0,
        status="not_started",
        progress_updated_at=datetime.utcnow(),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _serialize(db, goal)


@router.get("/", response_model=List[GoalOut])
def list_goals(user_id: int = Query(...), actor_id: int = Query(...),
               db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Цели сотрудника (в т.ч. история за прошлые периоды). Видимость: сам сотрудник
    или тимлид его команды."""
    _enforce_actor(current, actor_id)
    if actor_id != user_id and not _is_lead_of(db, actor_id, user_id):
        raise HTTPException(status_code=403, detail="Нет доступа к целям этого пользователя")
    # Только личные цели: командные приходят через /team/{team_id}/goals.
    rows = (db.query(Goal)
            .filter(Goal.user_id == user_id, Goal.scope == "personal")
            .order_by(Goal.created_at.desc()).all())
    return [_serialize(db, g) for g in rows]


@router.get("/team/{team_id}")
def team_goals(team_id: int, actor_id: int = Query(...),
               db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Сводный вид для тимлида: все сотрудники команды с их ЛИЧНЫМИ целями/
    статусами/прогрессом на одном экране. Доступ — только тимлиду команды."""
    _enforce_actor(current, actor_id)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Команда не найдена")
    if team.team_lead_id != actor_id:
        raise HTTPException(status_code=403, detail="Сводный вид доступен только тимлиду команды")

    member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
                  if tm.user_id != team.team_lead_id]
    members = []
    for uid in member_ids:
        u = db.query(User).filter(User.id == uid).first()
        goals = (db.query(Goal)
                 .filter(Goal.user_id == uid, Goal.scope == "personal")
                 .order_by(Goal.created_at.desc()).all())
        members.append({
            "user_id": uid,
            "user_name": u.name if u else f"#{uid}",
            "user_avatar_url": getattr(u, "avatar", None),
            "goals": [_serialize(db, g, with_comments=False) for g in goals],
        })
    return {"team_id": team_id, "members": members}


@router.get("/team/{team_id}/goals", response_model=List[GoalOut])
def team_shared_goals(team_id: int, actor_id: int = Query(...),
                      db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Командные цели (scope='team'): их ставит тимлид, видит вся команда.
    Доступ — тимлиду команды или любому её участнику."""
    _enforce_actor(current, actor_id)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Команда не найдена")
    if not _can_view_team(db, actor_id, team_id):
        raise HTTPException(status_code=403, detail="Нет доступа к целям этой команды")
    rows = (db.query(Goal)
            .filter(Goal.team_id == team_id, Goal.scope == "team")
            .order_by(Goal.created_at.desc()).all())
    return [_serialize(db, g) for g in rows]


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(goal_id: int, actor_id: int = Query(...),
             db: Session = Depends(get_db), current=Depends(get_current_user)):
    _enforce_actor(current, actor_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if not _can_view_goal(db, actor_id, goal):
        raise HTTPException(status_code=403, detail="Нет доступа к этой цели")
    return _serialize(db, goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, data: GoalUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Редактирование цели и прогресса — ТОЛЬКО владелец. Тимлид не может менять
    прогресс/статус за сотрудника (проверка на бэкенде)."""
    _enforce_actor(current, data.actor_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if data.actor_id != goal.user_id:
        raise HTTPException(status_code=403, detail="Редактировать цель может только её владелец")

    if data.title is not None:
        if not data.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        goal.title = data.title.strip()
    if data.description is not None:
        goal.description = data.description or None
    if data.period_label is not None:
        goal.period_label = data.period_label
    if data.period_start is not None:
        goal.period_start = data.period_start
    if data.period_end is not None:
        goal.period_end = data.period_end
    if data.skill_id is not None:
        goal.skill_id = data.skill_id or None

    _apply_status_progress(goal, data.status, data.progress, datetime.utcnow())
    db.commit()
    db.refresh(goal)
    # Синхронизация прогресса: цель — единый источник. Обновляем связанные шаги
    # плана развития под прогресс/статус цели (одно направление, без циклов).
    from app.services.development_sync import sync_steps_from_goal
    sync_steps_from_goal(db, goal)
    return _serialize(db, goal)


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, actor_id: int = Query(...),
                db: Session = Depends(get_db), current=Depends(get_current_user)):
    _enforce_actor(current, actor_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if actor_id != goal.user_id:
        raise HTTPException(status_code=403, detail="Удалить цель может только её владелец")
    db.delete(goal)
    db.commit()
    return {"ok": True}


@router.post("/{goal_id}/comments", response_model=GoalOut)
def add_comment(goal_id: int, data: GoalCommentCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Комментарий к цели.
    personal — комментируют обе стороны; итоговую обратную связь (feedback) даёт
               только тимлид;
    team     — обсуждают тимлид и участники команды (только обычные комментарии)."""
    _enforce_actor(current, data.actor_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    if not (data.body or "").strip():
        raise HTTPException(status_code=400, detail="Пустой комментарий")

    is_team = getattr(goal, "scope", "personal") == "team"
    is_owner = data.actor_id == goal.user_id
    rating = None

    if is_team:
        # Командную цель обсуждает вся команда; feedback тут неприменим.
        if not (goal.team_id and _can_view_team(db, data.actor_id, goal.team_id)):
            raise HTTPException(status_code=403, detail="Комментировать может тимлид или участник команды")
        kind = "comment"
    else:
        is_lead = _is_lead_of(db, data.actor_id, goal.user_id)
        if not (is_owner or is_lead):
            raise HTTPException(status_code=403, detail="Комментировать может владелец цели или тимлид команды")
        kind = "feedback" if data.kind == "feedback" else "comment"
        # Итоговая обратная связь — прерогатива тимлида (оценка сотрудника).
        if kind == "feedback" and not is_lead:
            raise HTTPException(status_code=403, detail="Обратную связь по цели оставляет тимлид")
        if kind == "feedback" and data.rating is not None:
            rating = max(1, min(5, int(data.rating)))

    db.add(GoalComment(goal_id=goal.id, author_id=data.actor_id, body=data.body.strip(), kind=kind, rating=rating))
    db.commit()
    db.refresh(goal)

    # Уведомление другой стороне (существующая система: веб + push + Telegram).
    actor_name = _name(db, data.actor_id) or "Участник"
    snippet = data.body.strip()[:80]
    if is_team:
        # Командная цель: владелец (тимлид) → всем участникам; участник → тимлиду.
        recipients = _team_member_ids(db, goal.team_id) if is_owner else [goal.user_id]
        title = "Комментарий к командной цели"
        for rid in recipients:
            if rid == data.actor_id:
                continue
            NotificationService(db).create_notification(
                user_id=rid, type="goal_comment",
                title=title, body=f"{actor_name}: {snippet}",
                data={"goal_id": goal.id, "team_id": goal.team_id},
            )
    elif is_owner:
        # сотрудник ответил — уведомляем тимлидов его команды
        for lead_id in _leads_of_user(db, goal.user_id):
            NotificationService(db).create_notification(
                user_id=lead_id, type="goal_comment",
                title="Комментарий к цели", body=f"{actor_name}: {snippet}",
                data={"goal_id": goal.id},
            )
    else:
        title = "Обратная связь по цели" if kind == "feedback" else "Комментарий к цели"
        NotificationService(db).create_notification(
            user_id=goal.user_id, type=("goal_feedback" if kind == "feedback" else "goal_comment"),
            title=title, body=f"{actor_name}: {snippet}",
            data={"goal_id": goal.id},
        )
    return _serialize(db, goal)
