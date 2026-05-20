from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.meeting import ScheduleRequest, ScheduleResponse, SlotProposal
from app.services.scheduling_service import SchedulingService

router = APIRouter()

@router.post("/slots", response_model=ScheduleResponse)
def get_available_slots(data: ScheduleRequest, db: Session = Depends(get_db)):
    service = SchedulingService(db)
    slots = service.find_available_slots(
        team_lead_id=data.team_lead_id,
        member_id=data.member_id,
        days_ahead=data.days_ahead,
    )
    return ScheduleResponse(
        proposed_slots=[
            SlotProposal(start=s[0], end=s[1]) for s in slots
        ]
    )