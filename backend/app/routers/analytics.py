from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.team import Team, TeamMember

router = APIRouter()

MOOD_SCORE = {"great": 4, "good": 3, "neutral": 2, "bad": 1}


def _mood_trend(meetings):
    scored = [(m.scheduled_date, MOOD_SCORE[m.mood]) for m in meetings if m.mood]
    scored.sort(key=lambda x: x[0])
    return [{"date": d.isoformat(), "score": s, "label": next(k for k, v in MOOD_SCORE.items() if v == s)} for d, s in scored]


def _meetings_per_week(meetings, weeks=8):
    now = datetime.utcnow()
    buckets = defaultdict(int)
    for m in meetings:
        delta = (now - m.scheduled_date).days
        week = delta // 7
        if week < weeks:
            buckets[weeks - 1 - week] += 1
    return [{"week": i, "count": buckets[i]} for i in range(weeks)]


@router.get("/lead/{user_id}")
def lead_analytics(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    teams = db.query(Team).filter(Team.team_lead_id == user_id).all()
    team_ids = [t.id for t in teams]

    if not team_ids:
        return {
            "total_meetings": 0,
            "total_members": 0,
            "avg_interval_days": None,
            "meetings_per_week": [],
            "top_members": [],
            "at_risk_members": [],
            "warning_signals": [],
            "hour_distribution": [],
            "per_member": [],
        }

    now = datetime.utcnow()
    cutoff_90 = now - timedelta(days=90)

    all_meetings = (
        db.query(Meeting)
        .filter(Meeting.team_lead_id == user_id, Meeting.scheduled_date >= cutoff_90)
        .order_by(Meeting.scheduled_date)
        .all()
    )

    all_members = db.query(TeamMember).filter(TeamMember.team_id.in_(team_ids)).all()
    member_ids = list({m.user_id for m in all_members})
    member_users = {u.id: u for u in db.query(User).filter(User.id.in_(member_ids)).all()}

    per_member_meetings = defaultdict(list)
    for m in all_meetings:
        per_member_meetings[m.member_id].append(m)

    per_member_tasks = defaultdict(list)
    tasks = db.query(Task).filter(Task.team_id.in_(team_ids)).all()
    for t in tasks:
        per_member_tasks[t.assigned_to].append(t)

    member_stats = []
    for uid in member_ids:
        u = member_users.get(uid)
        if not u:
            continue
        mtgs = sorted(per_member_meetings[uid], key=lambda m: m.scheduled_date)
        tsks = per_member_tasks[uid]
        open_tasks = sum(1 for t in tsks if not t.completed)
        closed_tasks = sum(1 for t in tsks if t.completed)
        last_mtg = mtgs[-1].scheduled_date if mtgs else None
        days_since = (now - last_mtg).days if last_mtg else None

        intervals = []
        for i in range(1, len(mtgs)):
            intervals.append((mtgs[i].scheduled_date - mtgs[i - 1].scheduled_date).days)
        avg_interval = round(sum(intervals) / len(intervals), 1) if intervals else None

        mood_scores = [MOOD_SCORE[m.mood] for m in mtgs if m.mood]
        avg_mood = round(sum(mood_scores) / len(mood_scores), 2) if mood_scores else None

        # mood declining: last 2 worse than previous 2
        mood_declining = False
        if len(mood_scores) >= 4:
            recent = sum(mood_scores[-2:]) / 2
            before = sum(mood_scores[-4:-2]) / 2
            mood_declining = recent < before - 0.5

        warnings = []
        if days_since is not None and days_since > 14:
            warnings.append("no_meeting_14_days")
        if mood_declining:
            warnings.append("mood_declining")
        if open_tasks > 3:
            warnings.append("many_incomplete_tasks")

        member_stats.append({
            "user_id": uid,
            "name": u.name,
            "email": u.email,
            "meetings_count": len(mtgs),
            "days_since_last": days_since,
            "avg_interval_days": avg_interval,
            "avg_mood": avg_mood,
            "mood_trend": _mood_trend(mtgs),
            "open_tasks": open_tasks,
            "closed_tasks": closed_tasks,
            "warnings": warnings,
        })

    warning_signals = [
        {"user_id": s["user_id"], "name": s["name"], "warnings": s["warnings"]}
        for s in member_stats if s["warnings"]
    ]

    top_members = sorted(member_stats, key=lambda s: s["meetings_count"], reverse=True)[:3]
    at_risk = [s for s in member_stats if "no_meeting_14_days" in s["warnings"] or "mood_declining" in s["warnings"]]

    all_intervals = []
    for s in member_stats:
        if s["avg_interval_days"] is not None:
            all_intervals.append(s["avg_interval_days"])
    avg_interval_days = round(sum(all_intervals) / len(all_intervals), 1) if all_intervals else None

    hour_counts = defaultdict(int)
    for m in all_meetings:
        hour_counts[m.scheduled_date.hour] += 1
    hour_distribution = [{"hour": h, "count": hour_counts[h]} for h in range(8, 22)]

    return {
        "total_meetings": len(all_meetings),
        "total_members": len(member_ids),
        "avg_interval_days": avg_interval_days,
        "meetings_per_week": _meetings_per_week(all_meetings),
        "top_members": top_members,
        "at_risk_members": at_risk,
        "warning_signals": warning_signals,
        "hour_distribution": hour_distribution,
        "per_member": member_stats,
    }


@router.get("/member/{user_id}")
def member_analytics(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    cutoff_90 = now - timedelta(days=90)
    cutoff_30 = now - timedelta(days=30)

    meetings = (
        db.query(Meeting)
        .filter(Meeting.member_id == user_id, Meeting.scheduled_date >= cutoff_90)
        .order_by(Meeting.scheduled_date)
        .all()
    )

    lead_initiated = sum(1 for m in meetings if m.team_lead_id != user_id)
    member_initiated = sum(1 for m in meetings if m.team_lead_id == user_id)

    last_mtg = meetings[-1].scheduled_date if meetings else None
    days_since_last = (now - last_mtg).days if last_mtg else None

    tasks = db.query(Task).filter(Task.assigned_to == user_id).all()
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.completed)
    open_tasks = total_tasks - completed_tasks
    closed_last_30 = sum(
        1 for t in tasks if t.completed and t.completed_at and t.completed_at >= cutoff_30
    )
    task_completion_pct = round(completed_tasks / total_tasks * 100) if total_tasks else 0

    weeks = 8
    mtgs_per_week = _meetings_per_week(meetings, weeks)

    return {
        "meetings_last_90": len(meetings),
        "lead_initiated": lead_initiated,
        "member_initiated": member_initiated,
        "days_since_last": days_since_last,
        "task_completion_pct": task_completion_pct,
        "open_tasks": open_tasks,
        "closed_last_30": closed_last_30,
        "mood_trend": _mood_trend(meetings),
        "meetings_per_week": mtgs_per_week,
    }
