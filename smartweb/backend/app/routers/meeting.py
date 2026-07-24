from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import uuid, httpx, json
from pydantic import BaseModel as PydanticBase
from app.database import get_db
from app.models.meeting import Meeting
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingUpdate, MeetingRequest, GroupMeetingCreate
from app.services.notification_service import NotificationService

router = APIRouter()


@router.post("/group", response_model=List[MeetingOut])
def create_group_meeting(data: GroupMeetingCreate, db: Session = Depends(get_db)):
    """Групповой созвон (Задача 4): назначить встречу нескольким участникам или
    всей команде. Создаём по одной строке Meeting на участника с общим group_id —
    формат 1-на-1 не затрагивается. Каждый участник получает уведомление.
    """
    from app.services import entitlements
    lead = db.query(User).filter(User.id == data.team_lead_id).first()
    # Лимит тарифа проверяем один раз на всю группу (это одно «событие встречи»).
    err = entitlements.meeting_limit_error(db, lead)
    if err:
        raise HTTPException(status_code=402, detail=err)

    # Определяем участников: вся команда (кроме тимлида) или явный список.
    if data.whole_team:
        rows = (
            db.query(TeamMember)
            .filter(TeamMember.team_id == data.team_id, TeamMember.role != "lead")
            .all()
        )
        member_ids = [tm.user_id for tm in rows if tm.user_id != data.team_lead_id]
    else:
        member_ids = [mid for mid in (data.member_ids or []) if mid != data.team_lead_id]

    # Дедуп, сохраняя порядок.
    seen = set()
    member_ids = [m for m in member_ids if not (m in seen or seen.add(m))]
    if not member_ids:
        raise HTTPException(status_code=400, detail="No members selected for the group meeting")

    group_id = uuid.uuid4().hex
    lead_name = lead.name if lead else "Тимлид"
    when = data.scheduled_date.strftime("%d.%m %H:%M") if data.scheduled_date else ""

    created = []
    for mid in member_ids:
        meeting = Meeting(
            team_id=data.team_id,
            team_lead_id=data.team_lead_id,
            member_id=mid,
            scheduled_date=data.scheduled_date,
            agenda=data.agenda,
            status="scheduled",
            group_id=group_id,
        )
        db.add(meeting)
        created.append(meeting)
    db.commit()

    # Уведомления каждому участнику (переиспользуем существующую систему).
    for meeting in created:
        db.refresh(meeting)
        NotificationService(db).meeting_scheduled(meeting.member_id, meeting.id, lead_name, when)

    return created

@router.post("/", response_model=MeetingOut)
def create_meeting(data: MeetingCreate, db: Session = Depends(get_db)):
    from app.services import entitlements
    # Права (быстрое действие «Создать встречу» из карточки): прямое назначение
    # встречи доступно только тимлиду команды. Участник вместо этого пользуется
    # предложением встречи (с согласием) — /api/proposals.
    _team = db.query(Team).filter(Team.id == data.team_id).first()
    if _team and _team.team_lead_id and data.team_lead_id != _team.team_lead_id:
        raise HTTPException(status_code=403, detail="Прямое создание встречи доступно только тимлиду команды")
    _lead = db.query(User).filter(User.id == data.team_lead_id).first()
    err = entitlements.meeting_limit_error(db, _lead)
    if err:
        raise HTTPException(status_code=402, detail=err)

    last_meeting = (
        db.query(Meeting)
        .filter(
            Meeting.member_id == data.member_id,
            Meeting.team_lead_id == data.team_lead_id,
            Meeting.team_id == data.team_id,
        )
        .order_by(Meeting.scheduled_date.desc())
        .first()
    )

    context = None
    if last_meeting:
        days_ago = (datetime.utcnow() - last_meeting.scheduled_date).days
        context = f"Last meeting: {days_ago} days ago. "
        if last_meeting.notes:
            context += f"Notes: {last_meeting.notes[:200]}"

    meeting = Meeting(
        **data.model_dump(),
        context_from_last=context,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    lead = db.query(User).filter(User.id == data.team_lead_id).first()
    lead_name = lead.name if lead else "Тимлид"
    when = meeting.scheduled_date.strftime("%d.%m %H:%M") if meeting.scheduled_date else ""
    NotificationService(db).meeting_scheduled(data.member_id, meeting.id, lead_name, when)

    return meeting

@router.get("/", response_model=List[MeetingOut])
def list_meetings(
    team_id: Optional[int] = Query(None),
    member_id: Optional[int] = Query(None),
    team_lead_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Meeting)
    if team_id:
        query = query.filter(Meeting.team_id == team_id)
    if member_id:
        query = query.filter(Meeting.member_id == member_id)
    if team_lead_id:
        query = query.filter(Meeting.team_lead_id == team_lead_id)
    if status:
        query = query.filter(Meeting.status == status)
    return query.order_by(Meeting.scheduled_date.desc()).all()

@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

@router.patch("/{meeting_id}", response_model=MeetingOut)
def update_meeting(meeting_id: int, data: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(meeting, key, value)
    # When rescheduling a cancelled meeting, restore it to scheduled
    if updates.get('is_rescheduled') and meeting.status in ('cancelled', 'declined'):
        meeting.status = 'scheduled'

    # Групповой созвон (Задача 4): смена статуса группового звонка применяется ко
    # ВСЕМ строкам группы (напр. завершение звонка гасит баннер у всех участников).
    if meeting.group_id and 'status' in updates:
        siblings = db.query(Meeting).filter(
            Meeting.group_id == meeting.group_id, Meeting.id != meeting.id
        ).all()
        for gm in siblings:
            gm.status = meeting.status
            if 'call_duration_seconds' in updates:
                gm.call_duration_seconds = updates['call_duration_seconds']

    db.commit()
    db.refresh(meeting)
    return meeting

@router.post("/request", response_model=MeetingOut)
def request_meeting(data: MeetingRequest, db: Session = Depends(get_db)):
    team_lead_id = data.team_lead_id
    if not team_lead_id:
        team = db.query(Team).filter(Team.id == data.team_id).first()
        if team:
            team_lead_id = team.team_lead_id
    meeting = Meeting(
        team_id=data.team_id,
        team_lead_id=team_lead_id,
        member_id=data.member_id,
        scheduled_date=data.scheduled_date,
        status="requested",
        agenda=data.topic,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    member = db.query(User).filter(User.id == data.member_id).first()
    member_name = member.name if member else "Участник"
    if team_lead_id:
        NotificationService(db).meeting_requested(team_lead_id, member_name, meeting.id)

    return meeting

@router.post("/{meeting_id}/confirm", response_model=MeetingOut)
def confirm_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.status = "confirmed"
    db.commit()
    db.refresh(meeting)

    lead = db.query(User).filter(User.id == meeting.team_lead_id).first()
    lead_name = lead.name if lead else "Тимлид"
    when = meeting.scheduled_date.strftime("%d.%m %H:%M") if meeting.scheduled_date else ""
    NotificationService(db).meeting_confirmed(meeting.member_id, lead_name, meeting.id, when)

    return meeting

@router.post("/{meeting_id}/end-call", response_model=MeetingOut)
def end_call(meeting_id: int, db: Session = Depends(get_db)):
    """End an active call — moves the meeting out of 'in_progress' so the
    'call in progress' banner disappears for both participants."""
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status == "in_progress":
        meeting.status = "completed"
        db.commit()
        db.refresh(meeting)
    return meeting

@router.post("/{meeting_id}/start-call")
def start_call(meeting_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not meeting.jitsi_room_name:
        # Групповой созвон (Задача 4): все участники группы заходят в ОДНУ комнату
        # (ключ по group_id), поэтому и статус, и комната ставятся на все строки
        # группы, а не только на текущую. У 1-на-1 поведение прежнее.
        if meeting.group_id:
            room_name = f"group-{meeting.group_id[:12]}-{uuid.uuid4().hex[:6]}"
            room_url = f"https://meet.jit.si/{room_name}"
            group_rows = db.query(Meeting).filter(Meeting.group_id == meeting.group_id).all()
            for gm in group_rows:
                gm.jitsi_room_name = room_name
                gm.jitsi_room_url = room_url
                gm.status = "in_progress"
        else:
            room_name = f"1on1-{meeting_id}-{uuid.uuid4().hex[:8]}"
            meeting.jitsi_room_name = room_name
            meeting.jitsi_room_url = f"https://meet.jit.si/{room_name}"
            meeting.status = "in_progress"
        db.commit()
        db.refresh(meeting)

    user = db.query(User).filter(User.id == user_id).first()
    caller_name = user.name if user else "Участник"

    # Уведомляем других участников о начале созвона.
    if meeting.group_id:
        group_rows = db.query(Meeting).filter(Meeting.group_id == meeting.group_id).all()
        notify_ids = {meeting.team_lead_id, *[gm.member_id for gm in group_rows]}
        notify_ids.discard(user_id)
        for nid in notify_ids:
            NotificationService(db).call_started(nid, caller_name, meeting.jitsi_room_url)
    else:
        notify_id = meeting.member_id if user_id == meeting.team_lead_id else meeting.team_lead_id
        NotificationService(db).call_started(notify_id, caller_name, meeting.jitsi_room_url)

    return {
        "room_url": meeting.jitsi_room_url,
        "room_name": meeting.jitsi_room_name,
        "user_name": caller_name,
        "is_moderator": user_id == meeting.team_lead_id,
    }


@router.post("/{meeting_id}/decline", response_model=MeetingOut)
def decline_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.status = "declined"
    db.commit()
    db.refresh(meeting)

    lead = db.query(User).filter(User.id == meeting.team_lead_id).first()
    lead_name = lead.name if lead else "Тимлид"
    NotificationService(db).meeting_declined(meeting.member_id, lead_name, meeting.id)

    return meeting

import os
AITUNNEL_KEY = os.getenv("AITUNNEL_KEY", "sk-aitunnel-3A8F25Qme3Mnnbw8Tgg3vIWzcYxUTcku")

class SlotRequest(PydanticBase):
    meeting_id: int
    cadence_days: int = 14

@router.post("/ai-slots")
def get_ai_slots(data: SlotRequest, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == data.meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Тарифное ограничение (Задача 3): AI-подбор слотов доступен не на всех тарифах.
    from app.services import entitlements
    _lead = db.query(User).filter(User.id == meeting.team_lead_id).first()
    entitlements.require_feature(db, _lead, "ai_slots")

    orig_dt = meeting.scheduled_date
    now = datetime.utcnow()
    cadence = data.cadence_days or 14
    base_dt = max(orig_dt, now + timedelta(days=1))

    prompt = (
        f"Тимлид переносит встречу. Текущая дата: {now.strftime('%Y-%m-%d')}. "
        f"Каденция встреч: каждые {cadence} дней. "
        f"Предложи ровно 3 варианта новой даты и времени встречи. "
        f"Учти рабочие часы (9:00-18:00), рабочие дни (пн-пт). "
        f"Ответ ТОЛЬКО JSON: {{\"slots\": [\"2025-06-02T10:00\", \"2025-06-03T14:00\", \"2025-06-04T11:00\"]}}"
    )
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": 150,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=15,
        )
        text = resp.json()["choices"][0]["message"]["content"].strip()
        if "```" in text:
            text = text.split("```")[1].lstrip("json").strip()
        result = json.loads(text)
        return {"slots": result.get("slots", [])}
    except Exception:
        slots = []
        for i in [1, cadence // 2, cadence]:
            dt = base_dt + timedelta(days=i)
            while dt.weekday() >= 5:
                dt += timedelta(days=1)
            slots.append(dt.replace(hour=10, minute=0, second=0, microsecond=0).isoformat())
        return {"slots": slots[:3]}
