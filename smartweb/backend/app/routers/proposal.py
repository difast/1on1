from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.meeting_proposal import MeetingProposal, MeetingProposalEvent
from app.models.meeting import Meeting
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.proposal import (
    ProposalCreate, ProposalAction, ProposalCounter, ProposalOut,
)
from app.services.notification_service import NotificationService

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, uid: Optional[int]) -> Optional[str]:
    if not uid:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else None


def _serialize(db: Session, p: MeetingProposal) -> dict:
    names = {}
    for uid in {p.from_user_id, p.to_user_id, *[e.actor_id for e in p.events]}:
        names[uid] = _name(db, uid)
    return {
        "id": p.id,
        "team_id": p.team_id,
        "from_user_id": p.from_user_id,
        "from_user_name": names.get(p.from_user_id),
        "to_user_id": p.to_user_id,
        "to_user_name": names.get(p.to_user_id),
        "topic": p.topic,
        "proposed_time": p.proposed_time,
        "status": p.status,
        "awaiting_user_id": p.awaiting_user_id,
        "last_actor_id": p.last_actor_id,
        "meeting_id": p.meeting_id,
        "created_at": p.created_at,
        "events": [
            {
                "id": e.id, "actor_id": e.actor_id, "actor_name": names.get(e.actor_id),
                "action": e.action, "proposed_time": e.proposed_time, "created_at": e.created_at,
            }
            for e in p.events
        ],
    }


def _notify(db: Session, user_id: int, title: str, body: str, proposal_id: int):
    NotificationService(db).create_notification(
        user_id=user_id, type="meeting_proposal", title=title, body=body,
        data={"proposal_id": proposal_id},
    )


def _resolve_team_id(db: Session, p: MeetingProposal) -> Optional[int]:
    if p.team_id:
        return p.team_id
    # Ищем общую команду: где получатель — участник, а инициатор в ней же.
    for uid in (p.to_user_id, p.from_user_id):
        tm = db.query(TeamMember).filter(TeamMember.user_id == uid).first()
        if tm:
            return tm.team_id
    # Либо команда, где кто-то из них тимлид.
    t = db.query(Team).filter(or_(Team.team_lead_id == p.from_user_id, Team.team_lead_id == p.to_user_id)).first()
    return t.id if t else None


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=ProposalOut)
def create_proposal(data: ProposalCreate, db: Session = Depends(get_db)):
    if data.from_user_id == data.to_user_id:
        raise HTTPException(status_code=400, detail="Cannot propose a meeting to yourself")
    p = MeetingProposal(
        team_id=data.team_id,
        from_user_id=data.from_user_id,
        to_user_id=data.to_user_id,
        topic=data.topic,
        proposed_time=data.proposed_time,
        status="pending",
        awaiting_user_id=data.to_user_id,   # ждём ответа получателя
        last_actor_id=data.from_user_id,
    )
    db.add(p)
    db.flush()
    db.add(MeetingProposalEvent(
        proposal_id=p.id, actor_id=data.from_user_id,
        action="proposed", proposed_time=data.proposed_time,
    ))
    db.commit()
    db.refresh(p)

    from_name = _name(db, data.from_user_id) or "Участник"
    when = data.proposed_time.strftime("%d.%m %H:%M")
    _notify(db, data.to_user_id, "Предложение встречи",
            f"{from_name} предлагает встречу {when}" + (f": {data.topic}" if data.topic else ""), p.id)
    return _serialize(db, p)


@router.get("/", response_model=List[ProposalOut])
def list_proposals(user_id: int = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(MeetingProposal)
        .filter(or_(MeetingProposal.from_user_id == user_id, MeetingProposal.to_user_id == user_id))
        .order_by(MeetingProposal.created_at.desc())
        .all()
    )
    return [_serialize(db, p) for p in rows]


@router.get("/{proposal_id}", response_model=ProposalOut)
def get_proposal(proposal_id: int, db: Session = Depends(get_db)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _serialize(db, p)


@router.post("/{proposal_id}/accept", response_model=ProposalOut)
def accept_proposal(proposal_id: int, data: ProposalAction, db: Session = Depends(get_db)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if p.status != "pending":
        raise HTTPException(status_code=400, detail="Proposal is not pending")
    if data.user_id != p.awaiting_user_id:
        raise HTTPException(status_code=403, detail="Not your turn to respond")

    # Встреча создаётся ТОЛЬКО здесь — после явного согласия обеих сторон.
    team_id = _resolve_team_id(db, p)
    if not team_id:
        raise HTTPException(status_code=400, detail="Cannot resolve team for the meeting")
    meeting = Meeting(
        team_id=team_id,
        team_lead_id=p.from_user_id,   # инициатор — организатор встречи
        member_id=p.to_user_id,
        scheduled_date=p.proposed_time,
        agenda=p.topic,
        status="scheduled",
    )
    db.add(meeting)
    db.flush()

    p.status = "accepted"
    p.awaiting_user_id = None
    p.meeting_id = meeting.id
    db.add(MeetingProposalEvent(
        proposal_id=p.id, actor_id=data.user_id, action="accepted", proposed_time=p.proposed_time,
    ))
    db.commit()
    db.refresh(p)

    # Уведомляем обе стороны: встреча назначена.
    acceptor = _name(db, data.user_id) or "Участник"
    when = p.proposed_time.strftime("%d.%m %H:%M")
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    _notify(db, other, "Встреча подтверждена",
            f"{acceptor} принял предложение встречи на {when}", p.id)
    return _serialize(db, p)


@router.post("/{proposal_id}/decline", response_model=ProposalOut)
def decline_proposal(proposal_id: int, data: ProposalAction, db: Session = Depends(get_db)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if p.status != "pending":
        raise HTTPException(status_code=400, detail="Proposal is not pending")
    if data.user_id != p.awaiting_user_id:
        raise HTTPException(status_code=403, detail="Not your turn to respond")

    p.status = "declined"
    p.awaiting_user_id = None
    db.add(MeetingProposalEvent(proposal_id=p.id, actor_id=data.user_id, action="declined"))
    db.commit()
    db.refresh(p)

    decliner = _name(db, data.user_id) or "Участник"
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    _notify(db, other, "Предложение встречи отклонено",
            f"{decliner} отклонил предложение встречи", p.id)
    return _serialize(db, p)


@router.post("/{proposal_id}/counter", response_model=ProposalOut)
def counter_proposal(proposal_id: int, data: ProposalCounter, db: Session = Depends(get_db)):
    """Встречное предложение другого времени — новый раунд переговоров."""
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if p.status != "pending":
        raise HTTPException(status_code=400, detail="Proposal is not pending")
    if data.user_id != p.awaiting_user_id:
        raise HTTPException(status_code=403, detail="Not your turn to respond")

    # Обновляем время «на столе» и передаём ход другой стороне.
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    p.proposed_time = data.proposed_time
    if data.topic is not None:
        p.topic = data.topic
    p.awaiting_user_id = other
    p.last_actor_id = data.user_id
    p.status = "pending"
    db.add(MeetingProposalEvent(
        proposal_id=p.id, actor_id=data.user_id, action="countered", proposed_time=data.proposed_time,
    ))
    db.commit()
    db.refresh(p)

    actor = _name(db, data.user_id) or "Участник"
    when = data.proposed_time.strftime("%d.%m %H:%M")
    _notify(db, other, "Предложено другое время",
            f"{actor} предлагает встречу {when}", p.id)
    return _serialize(db, p)
