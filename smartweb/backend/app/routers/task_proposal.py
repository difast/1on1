from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional

from app.database import get_db
from app.models.task_proposal import TaskProposal, TaskProposalEvent
from app.models.task import Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.task_proposal import (
    TaskProposalCreate, TaskProposalAction, TaskProposalComment, TaskProposalOut,
)
from app.services.notification_service import NotificationService

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, uid: Optional[int]) -> Optional[str]:
    if not uid:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else None


def _serialize(db: Session, p: TaskProposal) -> dict:
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
        "title": p.title,
        "description": p.description,
        "due_date": p.due_date,
        "status": p.status,
        "task_id": p.task_id,
        "created_at": p.created_at,
        "events": [
            {
                "id": e.id, "actor_id": e.actor_id, "actor_name": names.get(e.actor_id),
                "action": e.action, "note": e.note, "created_at": e.created_at,
            }
            for e in p.events
        ],
    }


def _notify(db: Session, user_id: int, title: str, body: str, proposal_id: int):
    NotificationService(db).create_notification(
        user_id=user_id, type="task_proposal", title=title, body=body,
        data={"task_proposal_id": proposal_id},
    )


def _resolve_team_id(db: Session, p: TaskProposal) -> Optional[int]:
    if p.team_id:
        return p.team_id
    for uid in (p.to_user_id, p.from_user_id):
        tm = db.query(TeamMember).filter(TeamMember.user_id == uid).first()
        if tm:
            return tm.team_id
    t = db.query(Team).filter(or_(Team.team_lead_id == p.from_user_id, Team.team_lead_id == p.to_user_id)).first()
    return t.id if t else None


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=TaskProposalOut)
def create_task_proposal(data: TaskProposalCreate, db: Session = Depends(get_db)):
    """Любой участник может предложить задачу другому. Задача НЕ создаётся здесь —
    только после явного принятия получателем."""
    if data.from_user_id == data.to_user_id:
        raise HTTPException(status_code=400, detail="Нельзя предложить задачу самому себе")
    if not (data.title or "").strip():
        raise HTTPException(status_code=400, detail="Укажите название задачи")
    if not db.query(User).filter(User.id == data.to_user_id).first():
        raise HTTPException(status_code=404, detail="Получатель не найден")

    p = TaskProposal(
        team_id=data.team_id,
        from_user_id=data.from_user_id,
        to_user_id=data.to_user_id,
        title=data.title.strip(),
        description=(data.description or None),
        due_date=data.due_date,
        status="pending",
    )
    db.add(p)
    db.flush()
    db.add(TaskProposalEvent(proposal_id=p.id, actor_id=data.from_user_id, action="proposed"))
    db.commit()
    db.refresh(p)

    from_name = _name(db, data.from_user_id) or "Участник"
    _notify(db, data.to_user_id, "Предложение задачи",
            f"{from_name} предлагает вам задачу: {p.title}", p.id)
    return _serialize(db, p)


@router.get("/", response_model=List[TaskProposalOut])
def list_task_proposals(user_id: int = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(TaskProposal)
        .filter(or_(TaskProposal.from_user_id == user_id, TaskProposal.to_user_id == user_id))
        .order_by(TaskProposal.created_at.desc())
        .all()
    )
    return [_serialize(db, p) for p in rows]


@router.get("/{proposal_id}", response_model=TaskProposalOut)
def get_task_proposal(proposal_id: int, db: Session = Depends(get_db)):
    p = db.query(TaskProposal).filter(TaskProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Предложение не найдено")
    return _serialize(db, p)


@router.post("/{proposal_id}/accept", response_model=TaskProposalOut)
def accept_task_proposal(proposal_id: int, data: TaskProposalAction, db: Session = Depends(get_db)):
    p = db.query(TaskProposal).filter(TaskProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Предложение не найдено")
    if p.status not in ("pending", "discussing"):
        raise HTTPException(status_code=400, detail="Предложение уже закрыто")
    # Право принять — только у получателя (он соглашается взять задачу).
    if data.user_id != p.to_user_id:
        raise HTTPException(status_code=403, detail="Принять предложение может только получатель")

    # Реальная задача создаётся ТОЛЬКО здесь — обычная задача без особых пометок,
    # так же интегрируется в списки/аналитику/счётчики.
    team_id = _resolve_team_id(db, p)
    task = Task(
        team_id=team_id,
        assigned_to=p.to_user_id,       # исполнитель — получатель
        assigned_by=p.from_user_id,     # автор — инициатор предложения
        title=p.title,
        description=p.description,
        due_date=p.due_date,
        status="in_progress",
        completed=False,
    )
    db.add(task)
    db.flush()

    p.status = "accepted"
    p.task_id = task.id
    db.add(TaskProposalEvent(proposal_id=p.id, actor_id=data.user_id, action="accepted"))
    db.commit()
    db.refresh(p)

    acceptor = _name(db, data.user_id) or "Участник"
    _notify(db, p.from_user_id, "Предложение задачи принято",
            f"{acceptor} принял задачу: {p.title}", p.id)
    return _serialize(db, p)


@router.post("/{proposal_id}/decline", response_model=TaskProposalOut)
def decline_task_proposal(proposal_id: int, data: TaskProposalAction, db: Session = Depends(get_db)):
    p = db.query(TaskProposal).filter(TaskProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Предложение не найдено")
    if p.status not in ("pending", "discussing"):
        raise HTTPException(status_code=400, detail="Предложение уже закрыто")
    if data.user_id != p.to_user_id:
        raise HTTPException(status_code=403, detail="Отклонить предложение может только получатель")

    p.status = "declined"
    db.add(TaskProposalEvent(proposal_id=p.id, actor_id=data.user_id, action="declined"))
    db.commit()
    db.refresh(p)

    decliner = _name(db, data.user_id) or "Участник"
    _notify(db, p.from_user_id, "Предложение задачи отклонено",
            f"{decliner} отклонил задачу: {p.title}", p.id)
    return _serialize(db, p)


@router.post("/{proposal_id}/comment", response_model=TaskProposalOut)
def comment_task_proposal(proposal_id: int, data: TaskProposalComment, db: Session = Depends(get_db)):
    """Обсуждение предложения до решения: обе стороны обмениваются комментариями."""
    p = db.query(TaskProposal).filter(TaskProposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Предложение не найдено")
    if p.status not in ("pending", "discussing"):
        raise HTTPException(status_code=400, detail="Предложение уже закрыто")
    # Комментировать могут только участники предложения.
    if data.user_id not in (p.from_user_id, p.to_user_id):
        raise HTTPException(status_code=403, detail="Только участники предложения могут обсуждать")
    if not (data.note or "").strip():
        raise HTTPException(status_code=400, detail="Пустой комментарий")

    if p.status == "pending":
        p.status = "discussing"
    db.add(TaskProposalEvent(
        proposal_id=p.id, actor_id=data.user_id, action="commented", note=data.note.strip(),
    ))
    db.commit()
    db.refresh(p)

    actor = _name(db, data.user_id) or "Участник"
    other = p.from_user_id if data.user_id == p.to_user_id else p.to_user_id
    _notify(db, other, "Обсуждение задачи",
            f"{actor}: {data.note.strip()[:80]}", p.id)
    return _serialize(db, p)
