from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os, time, httpx
from app.database import get_db
from app.models.meeting import Meeting
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingUpdate, MeetingRequest
from app.services.notification_service import NotificationService

router = APIRouter()

@router.post("/", response_model=MeetingOut)
def create_meeting(data: MeetingCreate, db: Session = Depends(get_db)):
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
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(meeting, key, value)
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

@router.post("/{meeting_id}/start-call")
def start_call(meeting_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    api_key = os.getenv("DAILY_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Daily.co not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    exp = int(time.time()) + 7200

    if not meeting.daily_room_name:
        room_name = f"1on1-{meeting_id}"
        resp = httpx.post("https://api.daily.co/v1/rooms", headers=headers, json={
            "name": room_name,
            "properties": {
                "exp": exp,
                "enable_recording": "cloud",
                "enable_transcription": "deepgram",
            },
        }, timeout=15)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"Daily room creation failed: {resp.text}")
        room = resp.json()
        meeting.daily_room_name = room["name"]
        meeting.daily_room_url = room["url"]
        db.commit()
        db.refresh(meeting)

    user = db.query(User).filter(User.id == user_id).first()
    is_owner = user_id == meeting.team_lead_id
    token_resp = httpx.post("https://api.daily.co/v1/meeting-tokens", headers=headers, json={
        "properties": {
            "room_name": meeting.daily_room_name,
            "user_name": user.name if user else "Участник",
            "is_owner": is_owner,
            "exp": exp,
        },
    }, timeout=15)
    if token_resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to create meeting token")

    return {
        "room_url": meeting.daily_room_url,
        "token": token_resp.json()["token"],
        "room_name": meeting.daily_room_name,
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
