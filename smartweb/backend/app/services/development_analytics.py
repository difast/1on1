"""Аналитика развития. Общий слой: используется и роутером развития, и общим
роутером аналитики (analytics.py), чтобы данные развития попадали в аналитику
без дублирования. Считается запросами/агрегатами, без выгрузки всех записей на
клиент (участник получает только свои данные, тимлид — агрегаты по команде).
"""
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session

from app.models.team import Team, TeamMember
from app.models.goal import Goal
from app.models.development import (
    Skill, UserSkill, SkillLevelHistory, DevelopmentStep,
    SKILL_LEVELS, DEV_STEP_OPEN_STATUSES,
)


def _quarter_start(now: datetime) -> datetime:
    q_first_month = ((now.month - 1) // 3) * 3 + 1
    return datetime(now.year, q_first_month, 1)


def _plan_stats(steps) -> dict:
    now = datetime.utcnow()
    considered = [s for s in steps if s.status != "cancelled"]
    done = [s for s in considered if s.status == "done"]
    active = [s for s in considered if s.status in DEV_STEP_OPEN_STATUSES]
    overdue = [s for s in active if s.due_date and s.due_date < now]
    progress = round(sum(int(s.progress or 0) for s in considered) / len(considered)) if considered else 0
    return {
        "total_steps": len(considered), "done_steps": len(done),
        "active_steps": len(active), "overdue_steps": len(overdue),
        "plan_progress": progress,
    }


def member_summary(db: Session, user_id: int) -> dict:
    now = datetime.utcnow()
    q_start = _quarter_start(now)
    prev_q_start = _quarter_start(q_start - timedelta(days=1))

    user_skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    skills_out = []
    levels = []
    gaps = 0
    for us in user_skills:
        skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
        gap = max(0, (us.desired_level or 0) - us.current_level) if us.desired_level else 0
        gaps += 1 if gap > 0 else 0
        levels.append(us.current_level)
        skills_out.append({
            "skill_name": skill.name if skill else None,
            "category": skill.category if skill else "technical",
            "current_level": us.current_level, "desired_level": us.desired_level, "gap": gap,
        })

    # Рост уровней: изменения уровня по кварталам (по истории).
    hist = (db.query(SkillLevelHistory)
            .join(UserSkill, SkillLevelHistory.user_skill_id == UserSkill.id)
            .filter(UserSkill.user_id == user_id).all())
    levelups_q = sum(1 for h in hist if h.changed_at and h.changed_at >= q_start)
    levelups_prev_q = sum(1 for h in hist if h.changed_at and prev_q_start <= h.changed_at < q_start)

    steps = db.query(DevelopmentStep).filter(DevelopmentStep.user_id == user_id).all()
    plan = _plan_stats(steps)
    done_this_q = sum(1 for s in steps if s.status == "done" and s.updated_at and s.updated_at >= q_start)
    done_prev_q = sum(1 for s in steps if s.status == "done" and s.updated_at and prev_q_start <= s.updated_at < q_start)

    learning = db.query(Goal).filter(Goal.user_id == user_id, Goal.goal_kind == "learning").all()
    learning_total = len(learning)
    learning_done = sum(1 for g in learning if g.status == "achieved")

    return {
        "avg_current_level": round(sum(levels) / len(levels), 1) if levels else None,
        "skills_count": len(user_skills),
        "gaps": gaps,
        "skills": skills_out,
        "plan": plan,
        "learning_goals": {"total": learning_total, "achieved": learning_done},
        "level_growth_quarter": levelups_q,
        "compare": {
            "levelups_quarter": levelups_q, "levelups_prev_quarter": levelups_prev_q,
            "steps_done_quarter": done_this_q, "steps_done_prev_quarter": done_prev_q,
        },
    }


def team_summary(db: Session, team_id: int, lead_id: int) -> dict:
    now = datetime.utcnow()
    q_start = _quarter_start(now)
    member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
                  if tm.user_id != lead_id]

    total = len(member_ids)
    with_plan = 0
    overdue_total = 0
    plan_progresses = []
    gap_total = 0
    cat_levels = defaultdict(list)     # category -> [levels]
    levelups_q = 0
    members_without_plan = []

    for uid in member_ids:
        u_skills = db.query(UserSkill).filter(UserSkill.user_id == uid).all()
        for us in u_skills:
            skill = db.query(Skill).filter(Skill.id == us.skill_id).first()
            cat = skill.category if skill else "technical"
            cat_levels[cat].append(us.current_level)
            if us.desired_level and us.desired_level > us.current_level:
                gap_total += 1
        steps = db.query(DevelopmentStep).filter(DevelopmentStep.user_id == uid).all()
        active = [s for s in steps if s.status in DEV_STEP_OPEN_STATUSES]
        overdue_total += sum(1 for s in active if s.due_date and s.due_date < now)
        p = _plan_stats(steps)
        plan_progresses.append(p["plan_progress"])
        if p["active_steps"] > 0:
            with_plan += 1
        else:
            u = db.query(TeamMember).filter(TeamMember.team_id == team_id, TeamMember.user_id == uid).first()
            members_without_plan.append(uid)
        hist = (db.query(SkillLevelHistory)
                .join(UserSkill, SkillLevelHistory.user_skill_id == UserSkill.id)
                .filter(UserSkill.user_id == uid).all())
        levelups_q += sum(1 for h in hist if h.changed_at and h.changed_at >= q_start)

    cat_avg = {cat: round(sum(v) / len(v), 1) for cat, v in cat_levels.items() if v}
    return {
        "team_id": team_id,
        "members_total": total,
        "with_active_plan": with_plan,
        "without_plan": total - with_plan,
        "members_without_plan": members_without_plan,
        "overdue_steps": overdue_total,
        "avg_plan_progress": round(sum(plan_progresses) / len(plan_progresses)) if plan_progresses else 0,
        "gap_total": gap_total,
        "category_avg_level": cat_avg,
        "levelups_quarter": levelups_q,
    }
