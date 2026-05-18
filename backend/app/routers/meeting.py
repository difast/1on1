from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.meeting import Meeting
from app.models.team import Team, TeamMember
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingUpdate, MeetingRequest

router = APIRouter()

@router.post("/", response_model=MeetingOut)
def create_meeting(data: MeetingCreate, db: Session = Depends(get_db)):
    # Get context from last meeting
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
    meeting = Meeting(
        team_id=data.team_id,
        team_lead_id=data.team_lead_id,
        member_id=data.member_id,
        scheduled_date=data.proposed_date,
        status="requested",
        agenda=data.topic,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting

@router.post("/{meeting_id}/confirm", response_model=MeetingOut)
def confirm_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.status = "confirmed"
    db.commit()
    db.refresh(meeting)
    return meeting

@router.post("/{meeting_id}/decline", response_model=MeetingOut)
def decline_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting.status = "declined"
    db.commit()
    db.refresh(meeting)
    return meeting