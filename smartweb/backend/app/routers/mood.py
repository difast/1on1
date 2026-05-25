from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import defaultdict
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.mood import MoodEntry

router = APIRouter()

class MoodCreate(BaseModel):
    team_id: int
    score: int  # 1-5

@router.post("/")
def submit_mood(data: MoodCreate, db: Session = Depends(get_db)):
    entry = MoodEntry(team_id=data.team_id, score=data.score)
    db.add(entry)
    db.commit()
    return {"ok": True}

@router.get("/team/{team_id}/summary")
def get_team_mood_summary(team_id: int, db: Session = Depends(get_db)):
    seven_ago = datetime.utcnow() - timedelta(days=7)
    entries = db.query(MoodEntry).filter(
        MoodEntry.team_id == team_id,
        MoodEntry.created_at >= seven_ago,
    ).all()

    by_day = defaultdict(list)
    for e in entries:
        day = e.created_at.strftime("%d.%m")
        by_day[day].append(e.score)

    days = []
    for i in range(7):
        day = (datetime.utcnow() - timedelta(days=6 - i)).strftime("%d.%m")
        scores = by_day.get(day, [])
        avg = round(sum(scores) / len(scores), 1) if scores else None
        days.append({"day": day, "avg": avg, "count": len(scores)})

    all_scores = [e.score for e in entries]
    overall_avg = round(sum(all_scores) / len(all_scores), 1) if all_scores else None

    return {
        "days": days,
        "total": len(entries),
        "overall_avg": overall_avg,
    }
