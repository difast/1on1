from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.interaction import Interaction, InteractionParticipant, InteractionReply, INTERACTION_TYPES
from app.models.task import Task
from app.models.user import User
from app.schemas.interaction import (
    InteractionCreate, InteractionAction, InteractionReplyIn, InteractionClose,
)
from app.services.notification_service import NotificationService
from app.services import task_collab

router = APIRouter()

TYPE_TITLE = {
    "collab_proposal": "Предложение совместной работы",
    "help_offer": "Предложение помощи",
    "consultation": "Запрос консультации",
    "discussion": "Обсуждение",
    "recommendation": "Рекомендация",
}


def _name(db: Session, uid: Optional[int]) -> Optional[str]:
    if not uid:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else None


def _notify(db: Session, user_id: int, ntype: str, title: str, body: str, interaction_id: int):
    if not user_id:
        return
    NotificationService(db).create_notification(
        user_id=user_id, type=ntype, title=title, body=body,
        data={"interaction_id": interaction_id},
    )


def _serialize(db: Session, it: Interaction) -> dict:
    ids = {it.from_user_id, it.to_user_id, it.subject_user_id,
           *[p.user_id for p in it.participants], *[r.author_id for r in it.replies]}
    names = {uid: _name(db, uid) for uid in ids if uid}
    return {
        "id": it.id, "type": it.type,
        "from_user_id": it.from_user_id, "from_user_name": names.get(it.from_user_id),
        "to_user_id": it.to_user_id, "to_user_name": names.get(it.to_user_id),
        "subject_user_id": it.subject_user_id, "subject_user_name": names.get(it.subject_user_id),
        "team_id": it.team_id, "task_id": it.task_id, "meeting_id": it.meeting_id,
        "topic": it.topic, "context": it.context, "desired_format": it.desired_format,
        "status": it.status, "outcome": it.outcome, "expires_at": it.expires_at,
        "created_at": it.created_at,
        "participants": [
            {"id": p.id, "user_id": p.user_id, "user_name": names.get(p.user_id), "role": p.role}
            for p in it.participants
        ],
        "replies": [
            {"id": r.id, "author_id": r.author_id, "author_name": names.get(r.author_id),
             "body": r.body, "created_at": r.created_at}
            for r in it.replies
        ],
    }


def _is_recipient(it: Interaction, user_id: int) -> bool:
    if it.to_user_id == user_id:
        return True
    return any(p.user_id == user_id for p in it.participants)


# ── create ───────────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
def create_interaction(data: InteractionCreate, db: Session = Depends(get_db)):
    if data.type not in INTERACTION_TYPES:
        raise HTTPException(status_code=400, detail="Unknown interaction type")

    it = Interaction(
        type=data.type,
        from_user_id=data.from_user_id,
        to_user_id=data.to_user_id,
        subject_user_id=data.subject_user_id,
        team_id=data.team_id,
        task_id=data.task_id,
        topic=data.topic,
        context=data.context,
        desired_format=data.desired_format,
        expires_at=data.expires_at,
        status="completed" if data.type == "recommendation" else "sent",
    )
    db.add(it)
    db.flush()

    from_name = _name(db, data.from_user_id) or "Участник"

    if data.type == "discussion":
        # Обсуждение (39.6): инициатор + приглашённые. Уведомляем приглашённых.
        db.add(InteractionParticipant(interaction_id=it.id, user_id=data.from_user_id, role="initiator"))
        seen = {data.from_user_id}
        for uid in (data.participant_ids or []):
            if uid in seen:
                continue
            seen.add(uid)
            db.add(InteractionParticipant(interaction_id=it.id, user_id=uid, role="participant"))
        db.commit(); db.refresh(it)
        for p in it.participants:
            if p.user_id != data.from_user_id:
                _notify(db, p.user_id, "interaction_discussion", "Новое обсуждение",
                        f"{from_name}: {it.topic or 'обсуждение'}", it.id)
        return _serialize(db, it)

    if data.type == "recommendation":
        # Рекомендация (39.7): фиксируется, видна команде в профиле. Уведомляем
        # рекомендуемого и, если указан, того, кому рекомендуют.
        db.commit(); db.refresh(it)
        if it.subject_user_id and it.subject_user_id != data.from_user_id:
            _notify(db, it.subject_user_id, "interaction_recommendation", "Вас рекомендовали",
                    f"{from_name}: {it.topic or 'эксперт'}", it.id)
        if it.to_user_id and it.to_user_id not in (data.from_user_id, it.subject_user_id):
            _notify(db, it.to_user_id, "interaction_recommendation", "Рекомендация коллеги",
                    f"{from_name} рекомендует {_name(db, it.subject_user_id)}", it.id)
        return _serialize(db, it)

    # 1:1 типы (collab_proposal / help_offer / consultation)
    if not data.to_user_id:
        raise HTTPException(status_code=400, detail="to_user_id required for this type")
    db.commit(); db.refresh(it)
    _notify(db, it.to_user_id, f"interaction_{it.type}", TYPE_TITLE.get(it.type, "Взаимодействие"),
            f"{from_name}: {it.topic or ''}".strip().rstrip(':'), it.id)
    return _serialize(db, it)


# ── feed / detail ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[dict])
def list_interactions(user_id: int = Query(...), db: Session = Depends(get_db)):
    part_sub = db.query(InteractionParticipant.interaction_id).filter(InteractionParticipant.user_id == user_id)
    rows = (
        db.query(Interaction)
        .filter(or_(
            Interaction.from_user_id == user_id,
            Interaction.to_user_id == user_id,
            Interaction.subject_user_id == user_id,
            Interaction.id.in_(part_sub),
        ))
        .order_by(Interaction.created_at.desc())
        .all()
    )
    return [_serialize(db, it) for it in rows]


@router.get("/recommendations/{user_id}", response_model=List[dict])
def list_recommendations(user_id: int, db: Session = Depends(get_db)):
    """Рекомендации ПРО участника (он — эксперт). Видны всей команде — в профиле."""
    rows = (
        db.query(Interaction)
        .filter(Interaction.type == "recommendation", Interaction.subject_user_id == user_id)
        .order_by(Interaction.created_at.desc())
        .all()
    )
    return [_serialize(db, it) for it in rows]


@router.get("/{interaction_id}", response_model=dict)
def get_interaction(interaction_id: int, db: Session = Depends(get_db)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    return _serialize(db, it)


# ── lifecycle ─────────────────────────────────────────────────────────────────

@router.post("/{interaction_id}/accept", response_model=dict)
def accept_interaction(interaction_id: int, data: InteractionAction, db: Session = Depends(get_db)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    if it.status != "sent":
        raise HTTPException(status_code=400, detail="Interaction is not pending")
    if data.user_id != it.to_user_id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept")

    actor_name = _name(db, data.user_id) or "Участник"

    if it.type == "collab_proposal":
        # 39.1: оба становятся исполнителями задачи.
        if not it.task_id:
            raise HTTPException(status_code=400, detail="No task linked to this proposal")
        task = db.query(Task).filter(Task.id == it.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        task_collab.add_assignee(db, task, it.from_user_id, data.user_id)
        task_collab.add_assignee(db, task, it.to_user_id, data.user_id)
        task_collab.log_activity(db, task.id, data.user_id, "collab_joined",
                                 f"{actor_name} принял(а) совместную работу")
    elif it.type == "help_offer":
        # 39.4: при принятии — связь с задачей (добавляем помогающего исполнителем).
        if it.task_id:
            task = db.query(Task).filter(Task.id == it.task_id).first()
            if task:
                task_collab.add_assignee(db, task, it.from_user_id, data.user_id)

    it.status = "accepted"
    db.commit(); db.refresh(it)
    _notify(db, it.from_user_id, f"interaction_{it.type}_accepted",
            "Предложение принято", f"{actor_name} принял(а): {it.topic or ''}".strip().rstrip(':'), it.id)
    return _serialize(db, it)


@router.post("/{interaction_id}/decline", response_model=dict)
def decline_interaction(interaction_id: int, data: InteractionAction, db: Session = Depends(get_db)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    if it.status != "sent":
        raise HTTPException(status_code=400, detail="Interaction is not pending")
    if data.user_id != it.to_user_id:
        raise HTTPException(status_code=403, detail="Only the recipient can decline")
    it.status = "declined"
    db.commit(); db.refresh(it)
    actor_name = _name(db, data.user_id) or "Участник"
    _notify(db, it.from_user_id, f"interaction_{it.type}_declined",
            "Предложение отклонено", f"{actor_name} отклонил(а)", it.id)
    return _serialize(db, it)


@router.post("/{interaction_id}/reply", response_model=dict)
def reply_interaction(interaction_id: int, data: InteractionReplyIn, db: Session = Depends(get_db)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    if it.type not in ("discussion", "consultation"):
        raise HTTPException(status_code=400, detail="Replies allowed only for discussions and consultations")
    if not data.body.strip():
        raise HTTPException(status_code=400, detail="Empty reply")
    # Право отвечать: участники обсуждения либо стороны консультации.
    allowed = {it.from_user_id, it.to_user_id, *[p.user_id for p in it.participants]}
    if data.user_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a participant")

    db.add(InteractionReply(interaction_id=it.id, author_id=data.user_id, body=data.body.strip()))
    db.commit(); db.refresh(it)

    author_name = _name(db, data.user_id) or "Участник"
    # Уведомляем остальных участников (не автора).
    for uid in (allowed - {data.user_id}):
        if uid:
            _notify(db, uid, "interaction_reply", "Новый ответ",
                    f"{author_name}: {it.topic or ''}".strip().rstrip(':'), it.id)
    return _serialize(db, it)


@router.post("/{interaction_id}/close", response_model=dict)
def close_interaction(interaction_id: int, data: InteractionClose, db: Session = Depends(get_db)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    allowed = {it.from_user_id, it.to_user_id, *[p.user_id for p in it.participants]}
    if data.user_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a participant")
    it.status = "completed"
    if data.outcome:
        it.outcome = data.outcome
    db.commit(); db.refresh(it)
    return _serialize(db, it)
