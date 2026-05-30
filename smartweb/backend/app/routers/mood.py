import httpx, json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import defaultdict
from pydantic import BaseModel
from typing import List, Optional

from app.database import get_db
from app.models.mood import MoodEntry

router = APIRouter()

AITUNNEL_KEY = "sk-aitunnel-3A8F25Qme3Mnnbw8Tgg3vIWzcYxUTcku"

def _analyze_survey(answers: List[str]) -> dict:
    filled = [a.strip() for a in answers if a.strip()]
    if not filled:
        return {"score": 3, "summary": "Нет ответов"}
    prompt = (
        "Analyze this Russian team member's anonymous daily mood survey answers. "
        "Return ONLY valid JSON with keys: score (integer 1-5, where 1=very bad, 5=excellent), "
        "summary (1 sentence in Russian, max 80 chars, anonymized summary of main themes).\n\n"
        "Answers:\n" + "\n".join(f"- {a}" for a in filled)
    )
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": 120,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=20,
        )
        text = resp.json()["choices"][0]["message"]["content"].strip()
        # Extract JSON even if wrapped in markdown
        if "```" in text:
            text = text.split("```")[1].lstrip("json").strip()
        result = json.loads(text)
        score = max(1, min(5, int(result.get("score", 3))))
        summary = str(result.get("summary", ""))[:200]
        return {"score": score, "summary": summary}
    except Exception:
        return {"score": 3, "summary": "Анализ недоступен"}


class MoodCreate(BaseModel):
    team_id: int
    answers: Optional[List[str]] = None  # survey answers; fallback to score if provided
    score: Optional[int] = None          # direct score (legacy)

@router.post("/")
def submit_mood(data: MoodCreate, db: Session = Depends(get_db)):
    answers = data.answers or []
    if answers:
        result = _analyze_survey(answers)
        score = result["score"]
        survey_text = "\n".join(a for a in answers if a.strip())
        ai_summary = result["summary"]
    else:
        score = max(1, min(5, data.score or 3))
        survey_text = None
        ai_summary = None
    entry = MoodEntry(team_id=data.team_id, score=score,
                      survey_text=survey_text, ai_summary=ai_summary)
    db.add(entry)
    db.commit()
    return {"ok": True, "score": score, "summary": ai_summary}


@router.get("/team/{team_id}/summary")
def get_team_mood_summary(team_id: int, db: Session = Depends(get_db)):
    twelve_weeks_ago = datetime.utcnow() - timedelta(weeks=12)
    entries = db.query(MoodEntry).filter(
        MoodEntry.team_id == team_id,
        MoodEntry.created_at >= twelve_weeks_ago,
    ).all()

    # Daily (last 7 days)
    seven_ago = datetime.utcnow() - timedelta(days=7)
    by_day = defaultdict(list)
    for e in entries:
        if e.created_at >= seven_ago:
            day = e.created_at.strftime("%d.%m")
            by_day[day].append(e.score)
    days = []
    for i in range(7):
        day = (datetime.utcnow() - timedelta(days=6 - i)).strftime("%d.%m")
        scores = by_day.get(day, [])
        days.append({"day": day, "avg": round(sum(scores)/len(scores), 1) if scores else None, "count": len(scores)})

    # Weekly (last 12 weeks)
    by_week = defaultdict(list)
    for e in entries:
        # ISO week key
        iso = e.created_at.isocalendar()
        wk = f"{iso[0]}-W{iso[1]:02d}"
        by_week[wk].append(e.score)
    weeks = []
    for i in range(12):
        dt = datetime.utcnow() - timedelta(weeks=11 - i)
        iso = dt.isocalendar()
        wk = f"{iso[0]}-W{iso[1]:02d}"
        label = dt.strftime("W%V")
        scores = by_week.get(wk, [])
        weeks.append({"week": label, "avg": round(sum(scores)/len(scores), 1) if scores else None, "count": len(scores)})

    all_scores = [e.score for e in entries]
    overall_avg = round(sum(all_scores)/len(all_scores), 1) if all_scores else None

    # Recent AI summaries (last 5)
    summaries = [e.ai_summary for e in sorted(entries, key=lambda x: x.created_at, reverse=True)
                 if e.ai_summary][:5]

    return {"days": days, "weeks": weeks, "total": len(entries),
            "overall_avg": overall_avg, "recent_summaries": summaries}
