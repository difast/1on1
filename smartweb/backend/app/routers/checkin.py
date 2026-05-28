from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel as PydanticBase
from datetime import date, datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.models.checkin import WorkCheckin
from app.models.team import TeamMember

router = APIRouter()


class CheckinAction(PydanticBase):
    user_id: int


class CheckinOut(PydanticBase):
    id: int
    user_id: int
    date: date
    arrived_at: Optional[datetime]
    left_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.post("/arrive", response_model=CheckinOut)
def arrive(data: CheckinAction, db: Session = Depends(get_db)):
    today = date.today()
    checkin = db.query(WorkCheckin).filter(
        WorkCheckin.user_id == data.user_id, WorkCheckin.date == today
    ).first()
    if not checkin:
        checkin = WorkCheckin(user_id=data.user_id, date=today, arrived_at=datetime.utcnow())
        db.add(checkin)
    else:
        checkin.arrived_at = datetime.utcnow()
        checkin.left_at = None
    db.commit()
    db.refresh(checkin)
    return checkin


@router.post("/leave", response_model=CheckinOut)
def leave(data: CheckinAction, db: Session = Depends(get_db)):
    today = date.today()
    checkin = db.query(WorkCheckin).filter(
        WorkCheckin.user_id == data.user_id, WorkCheckin.date == today
    ).first()
    if not checkin or not checkin.arrived_at:
        raise HTTPException(status_code=400, detail="No arrival recorded today")
    checkin.left_at = datetime.utcnow()
    db.commit()
    db.refresh(checkin)
    return checkin


@router.get("/today/{user_id}", response_model=Optional[CheckinOut])
def today_checkin(user_id: int, db: Session = Depends(get_db)):
    return db.query(WorkCheckin).filter(
        WorkCheckin.user_id == user_id, WorkCheckin.date == date.today()
    ).first()


@router.get("/team/{team_id}", response_model=List[CheckinOut])
def team_checkins(team_id: int, days: int = 7, db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=days - 1)
    member_ids = [
        tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
    ]
    if not member_ids:
        return []
    return (
        db.query(WorkCheckin)
        .filter(WorkCheckin.user_id.in_(member_ids), WorkCheckin.date >= since)
        .order_by(WorkCheckin.date.desc(), WorkCheckin.arrived_at)
        .all()
    )
