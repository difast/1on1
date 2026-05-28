from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timedelta
from app.database import get_db
from app.models.user import User
from app.models.team import Team
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.note import Note
from app.models.notification import Notification
from app.models.mood import MoodEntry
from app.models.knowledge import KnowledgeArticle
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app import online as online_cache

router = APIRouter()

@router.post("/{user_id}/heartbeat")
def heartbeat(user_id: int):
    online_cache.ping(user_id)
    return {"ok": True}

@router.get("/by-email/{email}", response_model=UserOut)
def get_user_by_email(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/", response_model=UserOut)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/admin/stats")
def get_admin_stats(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    ago30 = now - timedelta(days=30)
    ago14 = now - timedelta(days=14)
    ago7 = now - timedelta(days=7)

    users = db.query(User).order_by(User.created_at.desc()).all()
    teams = db.query(Team).all()
    meetings = db.query(Meeting).all()
    tasks = db.query(Task).all()

    leads = [u for u in users if u.role == 'team_lead']
    members = [u for u in users if u.role == 'member']

    meetings_30d = [m for m in meetings if m.created_at and m.created_at >= ago30]
    calls = [m for m in meetings if m.call_duration_seconds and m.call_duration_seconds > 0]
    tasks_done = [t for t in tasks if t.completed]

    # Per-user meeting and task counts
    user_meeting_counts = {}
    user_last_meeting = {}
    for m in meetings:
        for uid in [m.team_lead_id, m.member_id]:
            user_meeting_counts[uid] = user_meeting_counts.get(uid, 0) + 1
            if uid not in user_last_meeting or (m.scheduled_date and m.scheduled_date > user_last_meeting[uid]):
                user_last_meeting[uid] = m.scheduled_date

    user_task_counts = {}
    for t in tasks:
        user_task_counts[t.assigned_to] = user_task_counts.get(t.assigned_to, 0) + 1

    # Team membership
    team_members = {}
    team_lead_name = {}
    for u in users:
        if hasattr(u, 'team_id') and u.team_id:
            team_members.setdefault(u.team_id, []).append(u)
        if u.role == 'team_lead' and hasattr(u, 'team_id') and u.team_id:
            team_lead_name[u.team_id] = u.name

    team_meeting_counts = {}
    team_last_meeting = {}
    for m in meetings:
        tid = m.team_id
        team_meeting_counts[tid] = team_meeting_counts.get(tid, 0) + 1
        if tid not in team_last_meeting or (m.scheduled_date and m.scheduled_date > team_last_meeting[tid]):
            team_last_meeting[tid] = m.scheduled_date

    # Mood stats
    mood_entries = db.query(MoodEntry).all()
    mood_7d = [e for e in mood_entries if e.created_at and e.created_at >= ago7]
    mood_avg = round(sum(e.score for e in mood_entries) / len(mood_entries), 2) if mood_entries else None
    mood_avg_7d = round(sum(e.score for e in mood_7d) / len(mood_7d), 2) if mood_7d else None

    # Weekly mood trend (last 7 days, daily avg)
    daily_mood = {}
    for e in mood_7d:
        day = e.created_at.date().isoformat()
        daily_mood.setdefault(day, []).append(e.score)
    mood_daily = [{"date": d, "avg": round(sum(v)/len(v), 2)} for d, v in sorted(daily_mood.items())]

    # System table counts
    system_counts = {
        "users": len(users),
        "teams": len(teams),
        "meetings": len(meetings),
        "tasks": len(tasks),
        "notes": db.query(Note).count(),
        "notifications": db.query(Notification).count(),
        "mood_entries": len(mood_entries),
        "knowledge_articles": db.query(KnowledgeArticle).count(),
    }

    return {
        # Overview
        "total_users": len(users),
        "total_teams": len(teams),
        "total_leads": len(leads),
        "total_members": len(members),
        "total_meetings": len(meetings),
        "meetings_30d": len(meetings_30d),
        "total_calls": len(calls),
        "total_tasks": len(tasks),
        "tasks_done": len(tasks_done),
        # Users tab
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "title": u.title or "",
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "meetings_count": user_meeting_counts.get(u.id, 0),
                "tasks_count": user_task_counts.get(u.id, 0),
                "last_meeting": user_last_meeting[u.id].isoformat() if user_last_meeting.get(u.id) else None,
                "inactive": (user_last_meeting.get(u.id) is None or user_last_meeting[u.id] < ago14),
            }
            for u in users
        ],
        # Teams tab
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "lead_name": team_lead_name.get(t.id, "—"),
                "member_count": len(team_members.get(t.id, [])),
                "meetings_count": team_meeting_counts.get(t.id, 0),
                "last_meeting": team_last_meeting[t.id].isoformat() if team_last_meeting.get(t.id) else None,
            }
            for t in teams
        ],
        # Mood tab
        "mood": {
            "overall_avg": mood_avg,
            "avg_7d": mood_avg_7d,
            "total_submissions": len(mood_entries),
            "submissions_7d": len(mood_7d),
            "daily_trend": mood_daily,
        },
        # System tab
        "system": system_counts,
    }

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
