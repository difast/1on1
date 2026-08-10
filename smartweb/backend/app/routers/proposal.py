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
from app.services import i18n
from app.utils.auth import require_user
from app.services import tenancy

router = APIRouter()


def _assert_proposal_access(db: Session, current, p: MeetingProposal) -> None:
    """Изоляция организации для предложения встречи: доступ у сторон предложения
    или пользователя той же организации. Иначе 404."""
    if not tenancy.enforced():
        return
    uid = current.id
    if uid in (p.from_user_id, p.to_user_id):
        return
    if p.team_id is not None and tenancy.can_access_team(db, uid, p.team_id):
        return
    if tenancy.can_access_user(db, uid, p.from_user_id) or \
            tenancy.can_access_user(db, uid, p.to_user_id):
        return
    raise HTTPException(status_code=404, detail="Proposal not found")


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


def _notify(db: Session, user_id: int, title_key: str, body_key: str,
            proposal_id: int, **fmt):
    """Уведомление о предложении встречи на языке получателя (ключи словаря)."""
    if not user_id:
        return
    u = db.query(User).filter(User.id == user_id).first()
    lang = i18n.user_lang(u) if u else i18n.DEFAULT_LANG
    # Имя автора может быть пустым — подставляем нейтральное на языке получателя.
    if "name" in fmt and not fmt["name"]:
        fmt["name"] = i18n.t("interaction.fallback.member", lang)
    NotificationService(db).create_notification(
        user_id=user_id, type="meeting_proposal",
        title=i18n.t(title_key, lang),
        body=i18n.t(body_key, lang, **fmt),
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
def create_proposal(data: ProposalCreate, db: Session = Depends(get_db),
                    current=Depends(require_user)):
    if tenancy.enforced():
        data.from_user_id = current.id
        tenancy.assert_user_access(db, current, data.to_user_id)
        tenancy.assert_team_access(db, current, data.team_id)
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

    from_name = _name(db, data.from_user_id) or ""
    when = data.proposed_time.strftime("%d.%m %H:%M")
    _notify(db, data.to_user_id, "proposal.new.title",
            "proposal.new.bodyTopic" if data.topic else "proposal.new.body",
            p.id, name=from_name, when=when, topic=data.topic or "")
    return _serialize(db, p)


@router.get("/", response_model=List[ProposalOut])
def list_proposals(user_id: int = Query(...), db: Session = Depends(get_db),
                   current=Depends(require_user)):
    tenancy.assert_user_access(db, current, user_id)
    rows = (
        db.query(MeetingProposal)
        .filter(or_(MeetingProposal.from_user_id == user_id, MeetingProposal.to_user_id == user_id))
        .order_by(MeetingProposal.created_at.desc())
        .all()
    )
    return [_serialize(db, p) for p in rows]


@router.get("/{proposal_id}", response_model=ProposalOut)
def get_proposal(proposal_id: int, db: Session = Depends(get_db),
                 current=Depends(require_user)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    _assert_proposal_access(db, current, p)
    return _serialize(db, p)


@router.post("/{proposal_id}/accept", response_model=ProposalOut)
def accept_proposal(proposal_id: int, data: ProposalAction, db: Session = Depends(get_db),
                    current=Depends(require_user)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    _assert_proposal_access(db, current, p)
    if tenancy.enforced():
        data.user_id = current.id
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
    acceptor = _name(db, data.user_id) or ""
    when = p.proposed_time.strftime("%d.%m %H:%M")
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    _notify(db, other, "proposal.accepted.title", "proposal.accepted.body",
            p.id, name=acceptor, when=when)
    return _serialize(db, p)


@router.post("/{proposal_id}/decline", response_model=ProposalOut)
def decline_proposal(proposal_id: int, data: ProposalAction, db: Session = Depends(get_db),
                     current=Depends(require_user)):
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    _assert_proposal_access(db, current, p)
    if tenancy.enforced():
        data.user_id = current.id
    if p.status != "pending":
        raise HTTPException(status_code=400, detail="Proposal is not pending")
    if data.user_id != p.awaiting_user_id:
        raise HTTPException(status_code=403, detail="Not your turn to respond")

    p.status = "declined"
    p.awaiting_user_id = None
    db.add(MeetingProposalEvent(proposal_id=p.id, actor_id=data.user_id, action="declined"))
    db.commit()
    db.refresh(p)

    decliner = _name(db, data.user_id) or ""
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    _notify(db, other, "proposal.declined.title", "proposal.declined.body",
            p.id, name=decliner)
    return _serialize(db, p)


@router.post("/{proposal_id}/counter", response_model=ProposalOut)
def counter_proposal(proposal_id: int, data: ProposalCounter, db: Session = Depends(get_db),
                     current=Depends(require_user)):
    """Встречное предложение другого времени — новый раунд переговоров."""
    p = db.query(MeetingProposal).filter(MeetingProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    _assert_proposal_access(db, current, p)
    if tenancy.enforced():
        data.user_id = current.id
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

    actor = _name(db, data.user_id) or ""
    when = data.proposed_time.strftime("%d.%m %H:%M")
    _notify(db, other, "proposal.counter.title", "proposal.counter.body",
            p.id, name=actor, when=when)
    return _serialize(db, p)
