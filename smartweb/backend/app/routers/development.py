from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService
from app.services import entitlements
from app.services.development_sync import sync_steps_from_goal, plan_progress
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.goal import Goal, GoalComment, GOAL_STATUSES
from app.models.knowledge import KnowledgeArticle
from app.models.development import (
    Skill, UserSkill, SkillLevelHistory, DevelopmentStep, DevelopmentRecommendation,
    SKILL_CATEGORIES, SKILL_LEVELS, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX,
    DEV_STEP_STATUSES, DEV_STEP_OPEN_STATUSES, DEV_REC_SOURCES,
)
from app.schemas.development import (
    SkillCreate, UserSkillCreate, UserSkillUpdate, StepCreate, StepUpdate,
    RecommendationCreate, RecommendationAction,
)
from app.schemas.goal import GoalCommentCreate
# Переиспользуем механику прав и связку статус/прогресс из модуля «Цели».
from app.routers.goal import (
    _enforce_actor, _is_lead_of, _leads_of_user, _name, _apply_status_progress,
)

router = APIRouter()

SOURCE_LABEL = {"rule": "Правило", "lead": "Тимлид", "knowledge": "База знаний", "ai": "Ассистент Пит"}


# ── общие помощники ───────────────────────────────────────────────────────────

def _level_label(lvl: Optional[int]) -> Optional[str]:
    if lvl is None:
        return None
    return SKILL_LEVELS.get(int(lvl))


def _clamp_level(lvl: int) -> int:
    return max(SKILL_LEVEL_MIN, min(SKILL_LEVEL_MAX, int(lvl)))


def _user_team_id(db: Session, user_id: int) -> Optional[int]:
    tm = db.query(TeamMember).filter(TeamMember.user_id == user_id).first()
    return tm.team_id if tm else None


def _can_view_user(db: Session, actor_id: int, user_id: int) -> bool:
    """Развитие — чувствительные данные: видит сам сотрудник или тимлид его команды."""
    return actor_id == user_id or _is_lead_of(db, actor_id, user_id)


def _skill_name(db: Session, skill_id: Optional[int]) -> Optional[str]:
    if not skill_id:
        return None
    s = db.query(Skill).filter(Skill.id == skill_id).first()
    return s.name if s else None


def _serialize_skill(us: UserSkill, skill: Optional[Skill]) -> dict:
    desired = us.desired_level
    gap = max(0, (desired or 0) - us.current_level) if desired else 0
    return {
        "id": us.id, "user_id": us.user_id, "skill_id": us.skill_id,
        "skill_name": skill.name if skill else None,
        "category": skill.category if skill else "technical",
        "current_level": us.current_level, "current_level_label": _level_label(us.current_level),
        "desired_level": desired, "desired_level_label": _level_label(desired),
        "target_date": us.target_date, "gap": gap,
        "history": [
            {"id": h.id, "level": h.level, "level_label": _level_label(h.level),
             "changed_by": h.changed_by, "note": h.note, "changed_at": h.changed_at}
            for h in us.history
        ],
    }


def _serialize_comment(db: Session, c: GoalComment) -> dict:
    return {"id": c.id, "author_id": c.author_id, "author_name": _name(db, c.author_id),
            "body": c.body, "kind": c.kind, "rating": c.rating, "created_at": c.created_at}


def _serialize_step(db: Session, s: DevelopmentStep, with_comments: bool = True) -> dict:
    now = datetime.utcnow()
    overdue = bool(s.due_date and s.status in DEV_STEP_OPEN_STATUSES and s.due_date < now)
    goal = db.query(Goal).filter(Goal.id == s.goal_id).first() if s.goal_id else None
    comments = []
    if with_comments:
        rows = db.query(GoalComment).filter(GoalComment.step_id == s.id).order_by(GoalComment.id).all()
        comments = [_serialize_comment(db, c) for c in rows]
    return {
        "id": s.id, "user_id": s.user_id, "title": s.title, "description": s.description,
        "skill_id": s.skill_id, "skill_name": _skill_name(db, s.skill_id),
        "goal_id": s.goal_id, "goal_title": goal.title if goal else None,
        "task_id": s.task_id, "meeting_id": s.meeting_id, "due_date": s.due_date,
        "status": s.status, "progress": s.progress,
        "assigned_by": s.assigned_by, "assigned_by_name": _name(db, s.assigned_by),
        "assigned_by_lead": bool(s.assigned_by and s.assigned_by != s.user_id),
        "overdue": overdue, "comments": comments,
    }


def _serialize_rec(db: Session, r: DevelopmentRecommendation) -> dict:
    return {
        "id": r.id, "user_id": r.user_id, "skill_id": r.skill_id, "skill_name": _skill_name(db, r.skill_id),
        "source": r.source, "source_label": SOURCE_LABEL.get(r.source, r.source),
        "title": r.title, "body": r.body, "article_id": r.article_id,
        "target_level": r.target_level, "target_date": r.target_date,
        "status": r.status, "created_by": r.created_by, "created_by_name": _name(db, r.created_by),
        "created_at": r.created_at,
    }


# ── детерминированные рекомендации (правила + база знаний) ─────────────────────

def _ensure_rule_recommendations(db: Session, user_id: int):
    """Формируются ПРАВИЛАМИ (детерминированно): по разрыву уровней и по материалам
    базы знаний под навык. AI-рекомендации (Пит) создаются отдельным эндпоинтом."""
    skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    existing = db.query(DevelopmentRecommendation).filter(
        DevelopmentRecommendation.user_id == user_id,
        DevelopmentRecommendation.status == "new",
    ).all()
    have_rule = {(r.source, r.skill_id) for r in existing}
    team_id = _user_team_id(db, user_id)
    created = False

    for us in skills:
        if not us.desired_level or us.desired_level <= us.current_level:
            continue
        skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
        sname = skill.name if skill else "навык"
        # Правило: закрыть разрыв уровней.
        if ("rule", us.skill_id) not in have_rule:
            db.add(DevelopmentRecommendation(
                user_id=user_id, skill_id=us.skill_id, source="rule",
                title=f"Закрыть разрыв по навыку «{sname}»",
                body=f"Текущий уровень — {_level_label(us.current_level)}, целевой — "
                     f"{_level_label(us.desired_level)}. Добавьте шаг плана, чтобы двигаться к цели.",
            ))
            created = True
        # База знаний: материал по навыку.
        if ("knowledge", us.skill_id) not in have_rule:
            art = (db.query(KnowledgeArticle)
                   .filter(KnowledgeArticle.title.ilike(f"%{sname}%"),
                           or_(KnowledgeArticle.team_id == team_id, KnowledgeArticle.team_id.is_(None)))
                   .first())
            if art:
                db.add(DevelopmentRecommendation(
                    user_id=user_id, skill_id=us.skill_id, source="knowledge", article_id=art.id,
                    title=f"Материал базы знаний: {art.title}",
                    body="Изучите материал, связанный с этим навыком.",
                ))
                created = True
    if created:
        db.commit()


# ── справочник навыков ────────────────────────────────────────────────────────

@router.get("/skills")
def list_skills(team_id: Optional[int] = Query(None), actor_id: int = Query(...),
                db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Справочник навыков команды + общий (team_id NULL). Виден участникам команды."""
    _enforce_actor(current, actor_id)
    tid = team_id if team_id is not None else _user_team_id(db, actor_id)
    rows = (db.query(Skill)
            .filter(or_(Skill.team_id == tid, Skill.team_id.is_(None)))
            .order_by(Skill.category, Skill.name).all())
    return [{"id": s.id, "team_id": s.team_id, "name": s.name, "category": s.category,
             "created_by": s.created_by} for s in rows]


@router.post("/skills")
def create_skill(data: SkillCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Добавить навык в справочник команды (сопоставимый между людьми)."""
    _enforce_actor(current, data.actor_id)
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название навыка")
    category = data.category if data.category in SKILL_CATEGORIES else "technical"
    tid = data.team_id if data.team_id is not None else _user_team_id(db, data.actor_id)
    existing = (db.query(Skill)
                .filter(Skill.name.ilike(name),
                        or_(Skill.team_id == tid, Skill.team_id.is_(None))).first())
    if existing:
        return {"id": existing.id, "team_id": existing.team_id, "name": existing.name,
                "category": existing.category, "created_by": existing.created_by}
    skill = Skill(team_id=tid, name=name, category=category, created_by=data.actor_id)
    db.add(skill); db.commit(); db.refresh(skill)
    return {"id": skill.id, "team_id": skill.team_id, "name": skill.name,
            "category": skill.category, "created_by": skill.created_by}


# ── агрегат развития сотрудника ───────────────────────────────────────────────

@router.get("/{user_id}")
def get_development(user_id: int, actor_id: int = Query(...),
                   db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Развитие сотрудника: навыки, план (шаги), рекомендации, учебные цели.
    Видимость — сам сотрудник или тимлид его команды (проверка на бэкенде)."""
    _enforce_actor(current, actor_id)
    if not _can_view_user(db, actor_id, user_id):
        raise HTTPException(status_code=403, detail="Нет доступа к развитию этого сотрудника")

    # Рекомендации-правила формируем лениво при просмотре собственного развития.
    if actor_id == user_id:
        _ensure_rule_recommendations(db, user_id)

    user_skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    skills = []
    for us in user_skills:
        skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
        skills.append(_serialize_skill(us, skill))

    steps = (db.query(DevelopmentStep)
             .filter(DevelopmentStep.user_id == user_id)
             .order_by(DevelopmentStep.created_at.desc()).all())
    recs = (db.query(DevelopmentRecommendation)
            .filter(DevelopmentRecommendation.user_id == user_id)
            .order_by(DevelopmentRecommendation.created_at.desc()).all())
    learning = (db.query(Goal)
                .filter(Goal.user_id == user_id, Goal.goal_kind == "learning")
                .order_by(Goal.created_at.desc()).all())

    # Учебные цели сериализуем через модуль целей (единая модель, без дублей).
    from app.routers.goal import _serialize as _serialize_goal
    return {
        "user_id": user_id,
        "skills": skills,
        "steps": [_serialize_step(db, s) for s in steps],
        "recommendations": [_serialize_rec(db, r) for r in recs],
        "learning_goals": [_serialize_goal(db, g) for g in learning],
        "plan_progress": plan_progress(steps),
    }


# ── навыки сотрудника (уровни + история) ──────────────────────────────────────

@router.post("/skills/user")
def add_user_skill(data: UserSkillCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Добавить навык сотруднику с текущим/желаемым уровнем. Только сам сотрудник."""
    _enforce_actor(current, data.actor_id)
    if data.actor_id != data.user_id:
        raise HTTPException(status_code=403, detail="Добавлять навыки может только сам сотрудник")

    team_id = _user_team_id(db, data.user_id)
    skill_id = data.skill_id
    if not skill_id:
        name = (data.skill_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Укажите навык")
        category = data.category if data.category in SKILL_CATEGORIES else "technical"
        skill = (db.query(Skill)
                 .filter(Skill.name.ilike(name), or_(Skill.team_id == team_id, Skill.team_id.is_(None)))
                 .first())
        if not skill:
            skill = Skill(team_id=team_id, name=name, category=category, created_by=data.actor_id)
            db.add(skill); db.commit(); db.refresh(skill)
        skill_id = skill.id

    if db.query(UserSkill).filter(UserSkill.user_id == data.user_id, UserSkill.skill_id == skill_id).first():
        raise HTTPException(status_code=400, detail="Навык уже добавлен")

    cur = _clamp_level(data.current_level)
    des = _clamp_level(data.desired_level) if data.desired_level else None
    us = UserSkill(user_id=data.user_id, skill_id=skill_id, team_id=team_id,
                   current_level=cur, desired_level=des, target_date=data.target_date)
    db.add(us); db.commit(); db.refresh(us)
    db.add(SkillLevelHistory(user_skill_id=us.id, level=cur, changed_by=data.actor_id, note="Начальный уровень"))
    db.commit(); db.refresh(us)
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    return _serialize_skill(us, skill)


@router.patch("/skills/user/{us_id}")
def update_user_skill(us_id: int, data: UserSkillUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Изменить уровень/желаемый уровень/срок. Только владелец. При росте уровня —
    запись в историю; при достижении целевого уровня — уведомление тимлиду."""
    _enforce_actor(current, data.actor_id)
    us = db.query(UserSkill).filter(UserSkill.id == us_id).first()
    if not us:
        raise HTTPException(status_code=404, detail="Навык не найден")
    if data.actor_id != us.user_id:
        raise HTTPException(status_code=403, detail="Редактировать навык может только его владелец")

    reached = False
    if data.current_level is not None:
        new_level = _clamp_level(data.current_level)
        if new_level != us.current_level:
            us.current_level = new_level
            db.add(SkillLevelHistory(user_skill_id=us.id, level=new_level,
                                     changed_by=data.actor_id, note=(data.note or None)))
            if us.desired_level and new_level >= us.desired_level:
                reached = True
    if data.desired_level is not None:
        us.desired_level = _clamp_level(data.desired_level) if data.desired_level else None
    if data.target_date is not None:
        us.target_date = data.target_date
    db.commit(); db.refresh(us)

    skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
    if reached:
        sname = skill.name if skill else "навык"
        for lead_id in _leads_of_user(db, us.user_id):
            NotificationService(db).create_notification(
                user_id=lead_id, type="dev_level_reached",
                title="Достигнут целевой уровень",
                body=f"{_name(db, us.user_id)}: навык «{sname}» — {_level_label(us.current_level)}",
                data={"user_id": us.user_id, "skill_id": us.skill_id},
            )
    return _serialize_skill(us, skill)


@router.delete("/skills/user/{us_id}")
def delete_user_skill(us_id: int, actor_id: int = Query(...),
                      db: Session = Depends(get_db), current=Depends(get_current_user)):
    _enforce_actor(current, actor_id)
    us = db.query(UserSkill).filter(UserSkill.id == us_id).first()
    if not us:
        raise HTTPException(status_code=404, detail="Навык не найден")
    if actor_id != us.user_id:
        raise HTTPException(status_code=403, detail="Удалить навык может только его владелец")
    db.delete(us); db.commit()
    return {"ok": True}


# ── шаги плана развития ───────────────────────────────────────────────────────

@router.post("/steps")
def create_step(data: StepCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Создать шаг плана. Автор — сам сотрудник ИЛИ тимлид его команды (тогда шаг
    помечается как назначенный руководителем)."""
    _enforce_actor(current, data.actor_id)
    is_owner = data.actor_id == data.user_id
    is_lead = _is_lead_of(db, data.actor_id, data.user_id)
    if not (is_owner or is_lead):
        raise HTTPException(status_code=403, detail="Создавать шаги может сотрудник или его тимлид")
    if not (data.title or "").strip():
        raise HTTPException(status_code=400, detail="Укажите название шага")

    step = DevelopmentStep(
        user_id=data.user_id, title=data.title.strip(), description=(data.description or None),
        skill_id=data.skill_id, goal_id=data.goal_id, task_id=data.task_id, meeting_id=data.meeting_id,
        due_date=data.due_date, status="not_started", progress=0,
        assigned_by=data.actor_id, created_by=data.actor_id,
    )
    db.add(step); db.commit(); db.refresh(step)
    # Если шаг привязан к цели — сразу подтянуть прогресс из цели (единый источник).
    if step.goal_id:
        goal = db.query(Goal).filter(Goal.id == step.goal_id).first()
        if goal:
            sync_steps_from_goal(db, goal)
            db.refresh(step)
    # Назначенный тимлидом шаг — уведомление сотруднику.
    if is_lead and not is_owner:
        NotificationService(db).create_notification(
            user_id=data.user_id, type="dev_direction_assigned",
            title="Назначен шаг развития",
            body=f"{_name(db, data.actor_id)}: {step.title[:80]}",
            data={"step_id": step.id},
        )
    return _serialize_step(db, step)


@router.patch("/steps/{step_id}")
def update_step(step_id: int, data: StepUpdate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Редактировать шаг — только владелец плана. Если шаг привязан к цели, правка
    прогресса/статуса идёт ЧЕРЕЗ цель (единый источник), затем цель -> шаг."""
    _enforce_actor(current, data.actor_id)
    step = db.query(DevelopmentStep).filter(DevelopmentStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Шаг не найден")
    if data.actor_id != step.user_id:
        raise HTTPException(status_code=403, detail="Редактировать шаг может только владелец плана")

    if data.title is not None:
        if not data.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        step.title = data.title.strip()
    if data.description is not None:
        step.description = data.description or None
    if data.skill_id is not None:
        step.skill_id = data.skill_id or None
    if data.due_date is not None:
        step.due_date = data.due_date
    if data.goal_id is not None:
        step.goal_id = data.goal_id or None

    progress_status_touched = data.progress is not None or data.status is not None
    linked_goal = db.query(Goal).filter(Goal.id == step.goal_id).first() if step.goal_id else None

    if progress_status_touched and linked_goal:
        # Связанный шаг зеркалит цель. Прогресс пишем в ЦЕЛЬ (единый источник),
        # статус шага затем выводится из цели синком. Статусы шага/цели из разных
        # доменов, поэтому статус шага напрямую в цель не переносим.
        if linked_goal.user_id != data.actor_id:
            raise HTTPException(status_code=403, detail="Связанной целью управляет её владелец")
        _apply_status_progress(linked_goal, None, data.progress, datetime.utcnow())
        db.commit()
        sync_steps_from_goal(db, linked_goal)
        db.refresh(step)
    elif progress_status_touched:
        if data.status is not None:
            if data.status not in DEV_STEP_STATUSES:
                raise HTTPException(status_code=400, detail="Некорректный статус шага")
            step.status = data.status
        if data.progress is not None:
            step.progress = max(0, min(100, int(data.progress)))
        # Связка статус/прогресс для несвязанного шага.
        if step.status == "done":
            step.progress = 100
        elif step.progress >= 100:
            step.status = "done"
        elif step.status == "not_started" and step.progress > 0:
            step.status = "in_progress"
        db.commit()
    else:
        db.commit()

    db.refresh(step)
    return _serialize_step(db, step)


@router.delete("/steps/{step_id}")
def delete_step(step_id: int, actor_id: int = Query(...),
                db: Session = Depends(get_db), current=Depends(get_current_user)):
    _enforce_actor(current, actor_id)
    step = db.query(DevelopmentStep).filter(DevelopmentStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Шаг не найден")
    # Удалить может владелец плана или тимлид-автор своего назначенного шага.
    if actor_id != step.user_id and actor_id != step.created_by:
        raise HTTPException(status_code=403, detail="Нет прав на удаление шага")
    db.delete(step); db.commit()
    return {"ok": True}


@router.post("/steps/{step_id}/comments")
def add_step_comment(step_id: int, data: GoalCommentCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Комментарий/обратная связь по шагу плана — та же механика, что в «Целях»
    (модель GoalComment, feedback только у тимлида)."""
    _enforce_actor(current, data.actor_id)
    step = db.query(DevelopmentStep).filter(DevelopmentStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Шаг не найден")
    if not (data.body or "").strip():
        raise HTTPException(status_code=400, detail="Пустой комментарий")

    is_owner = data.actor_id == step.user_id
    is_lead = _is_lead_of(db, data.actor_id, step.user_id)
    if not (is_owner or is_lead):
        raise HTTPException(status_code=403, detail="Комментировать может владелец плана или тимлид")

    kind = "feedback" if data.kind == "feedback" else "comment"
    if kind == "feedback" and not is_lead:
        raise HTTPException(status_code=403, detail="Обратную связь оставляет тимлид")
    rating = None
    if kind == "feedback" and data.rating is not None:
        rating = max(1, min(5, int(data.rating)))

    db.add(GoalComment(step_id=step.id, author_id=data.actor_id, body=data.body.strip(), kind=kind, rating=rating))
    db.commit()

    actor_name = _name(db, data.actor_id) or "Участник"
    snippet = data.body.strip()[:80]
    if is_owner:
        for lead_id in _leads_of_user(db, step.user_id):
            NotificationService(db).create_notification(
                user_id=lead_id, type="dev_feedback", title="Комментарий к плану развития",
                body=f"{actor_name}: {snippet}", data={"step_id": step.id})
    else:
        NotificationService(db).create_notification(
            user_id=step.user_id, type="dev_feedback",
            title=("Обратная связь по развитию" if kind == "feedback" else "Комментарий к плану развития"),
            body=f"{actor_name}: {snippet}", data={"step_id": step.id})
    db.refresh(step)
    return _serialize_step(db, step)


# ── рекомендации / направления роста ──────────────────────────────────────────

@router.post("/recommendations")
def create_recommendation(data: RecommendationCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Тимлид назначает направление роста (source=lead): навык, целевой уровень,
    срок, комментарий. Приходит сотруднику уведомлением и в его план."""
    _enforce_actor(current, data.actor_id)
    if not _is_lead_of(db, data.actor_id, data.user_id):
        raise HTTPException(status_code=403, detail="Назначать направления роста может тимлид команды")
    if not (data.title or "").strip():
        raise HTTPException(status_code=400, detail="Укажите направление роста")
    rec = DevelopmentRecommendation(
        user_id=data.user_id, skill_id=data.skill_id, source="lead",
        title=data.title.strip(), body=(data.body or None),
        target_level=_clamp_level(data.target_level) if data.target_level else None,
        target_date=data.target_date, status="new", created_by=data.actor_id,
    )
    db.add(rec); db.commit(); db.refresh(rec)
    NotificationService(db).create_notification(
        user_id=data.user_id, type="dev_direction_assigned",
        title="Назначено направление роста",
        body=f"{_name(db, data.actor_id)}: {rec.title[:80]}",
        data={"recommendation_id": rec.id, "skill_id": rec.skill_id},
    )
    return _serialize_rec(db, rec)


@router.post("/recommendations/ai")
def ai_recommendation(user_id: int = Query(...), actor_id: int = Query(...),
                      db: Session = Depends(get_db), current=Depends(get_current_user)):
    """AI-рекомендация ассистента Пит по навыкам с разрывом. Тарифная функция
    (мягкое уведомление при недоступности)."""
    _enforce_actor(current, actor_id)
    if actor_id != user_id:
        raise HTTPException(status_code=403, detail="AI-рекомендации доступны только по своему развитию")
    user = db.query(User).filter(User.id == user_id).first()
    entitlements.require_feature(db, user, "pit")  # мягкое 402, не техническая ошибка

    gaps = [us for us in db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
            if us.desired_level and us.desired_level > us.current_level]
    if not gaps:
        raise HTTPException(status_code=400, detail="Нет навыков с разрывом для рекомендаций")
    us = gaps[0]
    skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
    sname = skill.name if skill else "навык"
    body = _pit_advice(sname, _level_label(us.current_level), _level_label(us.desired_level))
    rec = DevelopmentRecommendation(
        user_id=user_id, skill_id=us.skill_id, source="ai",
        title=f"Пит: как развивать «{sname}»", body=body, status="new",
    )
    db.add(rec); db.commit(); db.refresh(rec)
    return _serialize_rec(db, rec)


def _pit_advice(skill_name: str, cur: Optional[str], des: Optional[str]) -> str:
    """Персональный совет ассистента Пит. Best-effort вызов; при недоступности сети
    — короткая структурированная подсказка (эндпоинт остаётся рабочим)."""
    try:
        import httpx
        from app.prompts import AITUNNEL_KEY, PIT_SYSTEM_PROMPT
        prompt = (f"Дай короткий план развития навыка «{skill_name}» с уровня «{cur}» до «{des}». "
                  f"3-4 конкретных шага, без воды, без эмодзи.")
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": 400,
                  "messages": [{"role": "system", "content": PIT_SYSTEM_PROMPT},
                               {"role": "user", "content": prompt}]},
            timeout=20,
        )
        body = resp.json()
        return body["choices"][0]["message"]["content"]
    except Exception:
        return (f"Шаги для роста навыка «{skill_name}»: 1) изучите базовый материал и разберите пример; "
                f"2) примените на реальной задаче; 3) запросите обратную связь у тимлида; "
                f"4) закрепите результат и отметьте прогресс.")


@router.post("/recommendations/{rec_id}/action")
def act_on_recommendation(rec_id: int, data: RecommendationAction, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Принять рекомендацию (accepted -> станет шагом плана) или отклонить.
    Только сам сотрудник. Отклонение назначенного тимлидом направления
    сопровождается уведомлением тимлиду (можно приложить комментарий)."""
    _enforce_actor(current, data.actor_id)
    rec = db.query(DevelopmentRecommendation).filter(DevelopmentRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Рекомендация не найдена")
    if data.actor_id != rec.user_id:
        raise HTTPException(status_code=403, detail="Действие доступно только адресату рекомендации")
    if data.action not in ("accept", "dismiss"):
        raise HTTPException(status_code=400, detail="Некорректное действие")

    if data.action == "accept":
        rec.status = "accepted"
        # Направление роста тимлида задаёт желаемый уровень навыка.
        if rec.skill_id and rec.target_level:
            us = db.query(UserSkill).filter(
                UserSkill.user_id == rec.user_id, UserSkill.skill_id == rec.skill_id).first()
            if us and (not us.desired_level or us.desired_level < rec.target_level):
                us.desired_level = _clamp_level(rec.target_level)
                if rec.target_date:
                    us.target_date = rec.target_date
        # Рекомендация превращается в шаг плана.
        step = DevelopmentStep(
            user_id=rec.user_id, title=rec.title, description=rec.body,
            skill_id=rec.skill_id, due_date=rec.target_date, status="not_started", progress=0,
            assigned_by=(rec.created_by or rec.user_id), created_by=(rec.created_by or rec.user_id),
        )
        db.add(step); db.commit(); db.refresh(rec)
        if rec.created_by and rec.created_by != rec.user_id:
            NotificationService(db).create_notification(
                user_id=rec.created_by, type="dev_feedback",
                title="Направление роста принято",
                body=f"{_name(db, rec.user_id)}: {rec.title[:80]}",
                data={"user_id": rec.user_id})
        return _serialize_rec(db, rec)

    # dismiss
    rec.status = "dismissed"
    db.commit(); db.refresh(rec)
    if rec.created_by and rec.created_by != rec.user_id:
        note = (data.note or "").strip()
        NotificationService(db).create_notification(
            user_id=rec.created_by, type="dev_feedback",
            title="Направление роста отклонено",
            body=f"{_name(db, rec.user_id)}: {rec.title[:60]}" + (f" — {note[:60]}" if note else ""),
            data={"user_id": rec.user_id})
    return _serialize_rec(db, rec)


# ── сводный вид тимлида ───────────────────────────────────────────────────────

@router.get("/team/{team_id}")
def team_development(team_id: int, actor_id: int = Query(...),
                     db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Обзор развития команды: по каждому участнику — навыки, план, прогресс,
    просроченные шаги, наличие активного плана. Только тимлид команды."""
    _enforce_actor(current, actor_id)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Команда не найдена")
    if team.team_lead_id != actor_id:
        raise HTTPException(status_code=403, detail="Обзор развития команды доступен только тимлиду")

    member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
                  if tm.user_id != team.team_lead_id]
    now = datetime.utcnow()
    members = []
    for uid in member_ids:
        u = db.query(User).filter(User.id == uid).first()
        u_skills = db.query(UserSkill).filter(UserSkill.user_id == uid).all()
        steps = db.query(DevelopmentStep).filter(DevelopmentStep.user_id == uid).all()
        active_steps = [s for s in steps if s.status in DEV_STEP_OPEN_STATUSES]
        overdue = [s for s in steps if s.due_date and s.status in DEV_STEP_OPEN_STATUSES and s.due_date < now]
        gaps = sum(1 for us in u_skills if us.desired_level and us.desired_level > us.current_level)
        members.append({
            "user_id": uid, "user_name": u.name if u else f"#{uid}",
            "skills": [_serialize_skill(us, db.query(Skill).filter(Skill.id == us.skill_id).first()) for us in u_skills],
            "plan_progress": plan_progress(steps),
            "active_steps": len(active_steps),
            "overdue_steps": len(overdue),
            "gaps": gaps,
            "has_active_plan": len(active_steps) > 0,
        })
    return {"team_id": team_id, "members": members}


# ── аналитика развития ────────────────────────────────────────────────────────

@router.get("/analytics/member/{user_id}")
def member_dev_analytics(user_id: int, actor_id: int = Query(...),
                         db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Аналитика развития участника — только собственные данные (4.2, 4.5)."""
    _enforce_actor(current, actor_id)
    if actor_id != user_id:
        raise HTTPException(status_code=403, detail="Доступ только к своей аналитике развития")
    from app.services import development_analytics as da
    return da.member_summary(db, user_id)


@router.get("/analytics/team/{team_id}")
def team_dev_analytics(team_id: int, actor_id: int = Query(...),
                       db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Аналитика развития команды — только тимлид (4.3, 4.5). Считается запросом,
    без выгрузки всех записей на клиент (4.6)."""
    _enforce_actor(current, actor_id)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Команда не найдена")
    if team.team_lead_id != actor_id:
        raise HTTPException(status_code=403, detail="Аналитика развития команды доступна только тимлиду")
    from app.services import development_analytics as da
    return da.team_summary(db, team_id, team.team_lead_id)
