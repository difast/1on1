import httpx, json
from datetime import datetime, timedelta, date, time
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.mood import MoodEntry
from app.models.team import Team, TeamMember
from app.utils.auth import get_current_user
from app.services import mood_service

router = APIRouter()

import os
AITUNNEL_KEY = os.getenv("AITUNNEL_KEY", "sk-aitunnel-3A8F25Qme3Mnnbw8Tgg3vIWzcYxUTcku")


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
        if "```" in text:
            text = text.split("```")[1].lstrip("json").strip()
        result = json.loads(text)
        score = max(1, min(5, int(result.get("score", 3))))
        summary = str(result.get("summary", ""))[:200]
        return {"score": score, "summary": summary}
    except Exception:
        return {"score": 3, "summary": "Анализ недоступен"}


def _is_team_lead(db: Session, team_id: int, user_id: int) -> bool:
    t = db.query(Team).filter(Team.id == team_id).first()
    return bool(t and t.team_lead_id == user_id)


class MoodCreate(BaseModel):
    team_id: int
    user_id: Optional[int] = None
    answers: Optional[List[str]] = None
    score: Optional[int] = None


@router.post("/")
def submit_mood(data: MoodCreate, db: Session = Depends(get_db), current=Depends(get_current_user)):
    # Автор берётся из токена (надёжно), иначе из тела (совместимость).
    user_id = (current.id if current else None) or data.user_id

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

    tz = mood_service.team_tz(db, data.team_id)
    today = mood_service.now_local(tz).date()
    local_day = datetime.combine(today, time.min)

    # Повторное заполнение за день (12.1): обновляем существующую запись автора за
    # сегодня, а не плодим дубли. У анонимных (без user_id) дедупа нет.
    entry = None
    was_update = False
    if user_id is not None:
        for e in db.query(MoodEntry).filter(
            MoodEntry.team_id == data.team_id, MoodEntry.user_id == user_id,
        ).order_by(MoodEntry.created_at.desc()).all():
            if mood_service.local_date(e.created_at, tz) == today:
                entry = e
                break

    if entry:
        was_update = True
        entry.score = score
        entry.survey_text = survey_text
        entry.ai_summary = ai_summary
        entry.local_day = local_day
    else:
        entry = MoodEntry(team_id=data.team_id, user_id=user_id, score=score,
                          survey_text=survey_text, ai_summary=ai_summary, local_day=local_day)
        db.add(entry)
    db.commit()
    return {"ok": True, "score": score, "summary": ai_summary, "updated": was_update}


@router.get("/today/{user_id}")
def get_today_mood(user_id: int, team_id: int = Query(...), db: Session = Depends(get_db),
                   current=Depends(get_current_user)):
    """Заполнил ли пользователь чек-ин сегодня (для реактивного UI и дедупа)."""
    if current and current.id != user_id:
        raise HTTPException(status_code=403, detail="Доступ только к своим данным")
    tz = mood_service.team_tz(db, team_id)
    today = mood_service.now_local(tz).date()
    for e in db.query(MoodEntry).filter(
        MoodEntry.team_id == team_id, MoodEntry.user_id == user_id,
    ).order_by(MoodEntry.created_at.desc()).all():
        if mood_service.local_date(e.created_at, tz) == today:
            return {"filled": True, "score": e.score}
    return {"filled": False}


@router.get("/me/{user_id}/series")
def get_my_mood_series(user_id: int, period: str = Query("month"),
                       start: Optional[str] = Query(None), end: Optional[str] = Query(None),
                       team_id: Optional[int] = Query(None),
                       db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Личный ряд настроения пользователя (27.1). Права: только свои данные."""
    if current and current.id != user_id:
        raise HTTPException(status_code=403, detail="Доступ только к своим данным")
    tz = mood_service.team_tz(db, team_id) if team_id else ZoneInfo("UTC")
    today = datetime.now(tz).date()
    if start and end:
        try:
            s = date.fromisoformat(start); e = date.fromisoformat(end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат дат")
    else:
        span = 7 if period == "week" else 30
        s, e = today - timedelta(days=span - 1), today
    series = mood_service.user_series(db, user_id, tz, s, e)
    return {"period": period, "start": s.isoformat(), "end": e.isoformat(), "series": series}


@router.get("/team/{team_id}/summary")
def get_team_mood_summary(team_id: int, db: Session = Depends(get_db),
                          current=Depends(get_current_user)):
    """Анонимная командная сводка (13.3/13.5). Права: только тимлид команды."""
    if current and not _is_team_lead(db, team_id, current.id):
        raise HTTPException(status_code=403, detail="Доступ только тимлиду команды")
    summary = mood_service.team_summary(db, team_id)
    # Обратная совместимость с прежним ответом (total/overall_avg/recent_summaries).
    summary["total"] = db.query(MoodEntry).filter(MoodEntry.team_id == team_id).count()
    summary["overall_avg"] = summary.get("avg")
    # Сводки ИИ отдаём только при достаточности данных (иначе анонимность под угрозой).
    if not summary.get("insufficient"):
        recent = (db.query(MoodEntry)
                  .filter(MoodEntry.team_id == team_id, MoodEntry.ai_summary.isnot(None))
                  .order_by(MoodEntry.created_at.desc()).limit(5).all())
        summary["recent_summaries"] = [e.ai_summary for e in recent]
    else:
        summary["recent_summaries"] = []
    return summary
