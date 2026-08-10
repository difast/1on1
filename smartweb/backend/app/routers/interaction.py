from fastapi import APIRouter, Depends, HTTPException, Query
from app.services import i18n
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
from app.utils.auth import require_user
from app.services import tenancy

router = APIRouter()


def _assert_interaction_access(db: Session, current, it: Interaction) -> None:
    """Изоляция организации для взаимодействия. Доступ есть, если оно относится к
    команде актора (team_id) либо актор — одна из вовлечённых сторон, либо он в
    одной организации с инициатором. Иначе 404 (не раскрываем чужое)."""
    if not tenancy.enforced():
        return
    uid = current.id
    involved = {it.from_user_id, it.to_user_id, it.subject_user_id,
                *[p.user_id for p in it.participants]}
    if uid in involved:
        return
    if it.team_id is not None and tenancy.can_access_team(db, uid, it.team_id):
        return
    if tenancy.can_access_user(db, uid, it.from_user_id):
        return
    raise HTTPException(status_code=404, detail="Interaction not found")

TYPE_TITLE = {
    "collab_proposal": "interaction.type.collab",
    "help_offer": "interaction.type.help",
    "consultation": "interaction.type.consultation",
    "discussion": "interaction.type.discussion",
    "recommendation": "interaction.type.recommendation",
}


def _name(db: Session, uid: Optional[int]) -> Optional[str]:
    if not uid:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else None


def _notify(db: Session, user_id: int, ntype: str, title_key: str, body_key: str,
            interaction_id: int, **fmt):
    """Уведомление о взаимодействии. Тексты — ключи словаря: подставляются на
    языке получателя, как и остальные уведомления."""
    if not user_id:
        return
    user = db.query(User).filter(User.id == user_id).first()
    lang = i18n.user_lang(user) if user else i18n.DEFAULT_LANG
    NotificationService(db).create_notification(
        user_id=user_id, type=ntype,
        title=i18n.t(title_key, lang),
        body=i18n.t(body_key, lang, **fmt) if body_key else None,
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
def create_interaction(data: InteractionCreate, db: Session = Depends(get_db),
                       current=Depends(require_user)):
    if data.type not in INTERACTION_TYPES:
        raise HTTPException(status_code=400, detail="Unknown interaction type")
    # Инициатор — текущий пользователь (не произвольный from_user_id), и создавать
    # взаимодействие можно только в своей организации.
    if tenancy.enforced():
        data.from_user_id = current.id
        tenancy.assert_team_access(db, current, data.team_id)
        if data.to_user_id:
            tenancy.assert_user_access(db, current, data.to_user_id)

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

    from_name = _name(db, data.from_user_id) or i18n.t("interaction.fallback.member")

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
                _notify(db, p.user_id, "interaction_discussion", "interaction.newDiscussion",
                        "interaction.body.fromTopic", it.id, name=from_name,
                        topic=it.topic or i18n.t("interaction.fallback.discussion"))
        return _serialize(db, it)

    if data.type == "recommendation":
        # Рекомендация (39.7): фиксируется, видна команде в профиле. Уведомляем
        # рекомендуемого и, если указан, того, кому рекомендуют.
        db.commit(); db.refresh(it)
        if it.subject_user_id and it.subject_user_id != data.from_user_id:
            _notify(db, it.subject_user_id, "interaction_recommendation", "interaction.recommended",
                    "interaction.body.fromTopic", it.id, name=from_name,
                    topic=it.topic or i18n.t("interaction.fallback.expert"))
        if it.to_user_id and it.to_user_id not in (data.from_user_id, it.subject_user_id):
            _notify(db, it.to_user_id, "interaction_recommendation", "interaction.colleagueRec",
                    "interaction.body.recommends", it.id, name=from_name,
                    subject=_name(db, it.subject_user_id))
        return _serialize(db, it)

    # 1:1 типы (collab_proposal / help_offer / consultation)
    if not data.to_user_id:
        raise HTTPException(status_code=400, detail="to_user_id required for this type")
    db.commit(); db.refresh(it)
    _notify(db, it.to_user_id, f"interaction_{it.type}",
            TYPE_TITLE.get(it.type, "interaction.generic"),
            "interaction.body.fromTopic", it.id, name=from_name, topic=it.topic or "")
    return _serialize(db, it)


# ── feed / detail ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[dict])
def list_interactions(user_id: int = Query(...), db: Session = Depends(get_db),
                      current=Depends(require_user)):
    # Свой фид взаимодействий: чужой user_id из другой организации недоступен.
    tenancy.assert_user_access(db, current, user_id)
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
def list_recommendations(user_id: int, db: Session = Depends(get_db),
                         current=Depends(require_user)):
    """Рекомендации ПРО участника (он — эксперт). Видны всей команде — в профиле."""
    tenancy.assert_user_access(db, current, user_id)
    rows = (
        db.query(Interaction)
        .filter(Interaction.type == "recommendation", Interaction.subject_user_id == user_id)
        .order_by(Interaction.created_at.desc())
        .all()
    )
    return [_serialize(db, it) for it in rows]


@router.get("/{interaction_id}", response_model=dict)
def get_interaction(interaction_id: int, db: Session = Depends(get_db),
                    current=Depends(require_user)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    _assert_interaction_access(db, current, it)
    return _serialize(db, it)


# ── lifecycle ─────────────────────────────────────────────────────────────────

@router.post("/{interaction_id}/accept", response_model=dict)
def accept_interaction(interaction_id: int, data: InteractionAction, db: Session = Depends(get_db),
                       current=Depends(require_user)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    _assert_interaction_access(db, current, it)
    if tenancy.enforced():
        data.user_id = current.id
    if it.status != "sent":
        raise HTTPException(status_code=400, detail="Interaction is not pending")
    if data.user_id != it.to_user_id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept")

    actor_name = _name(db, data.user_id) or i18n.t("interaction.fallback.member")

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
                                 i18n.t("interaction.body.accepted", name=actor_name))
    elif it.type == "help_offer":
        # 39.4: при принятии — связь с задачей (добавляем помогающего исполнителем).
        if it.task_id:
            task = db.query(Task).filter(Task.id == it.task_id).first()
            if task:
                task_collab.add_assignee(db, task, it.from_user_id, data.user_id)

    it.status = "accepted"
    db.commit(); db.refresh(it)
    _notify(db, it.from_user_id, f"interaction_{it.type}_accepted",
            "interaction.accepted.title", "interaction.body.fromTopic", it.id,
            name=actor_name, topic=it.topic or "")
    return _serialize(db, it)


@router.post("/{interaction_id}/decline", response_model=dict)
def decline_interaction(interaction_id: int, data: InteractionAction, db: Session = Depends(get_db),
                        current=Depends(require_user)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    _assert_interaction_access(db, current, it)
    if tenancy.enforced():
        data.user_id = current.id
    if it.status != "sent":
        raise HTTPException(status_code=400, detail="Interaction is not pending")
    if data.user_id != it.to_user_id:
        raise HTTPException(status_code=403, detail="Only the recipient can decline")
    it.status = "declined"
    db.commit(); db.refresh(it)
    actor_name = _name(db, data.user_id) or i18n.t("interaction.fallback.member")
    _notify(db, it.from_user_id, f"interaction_{it.type}_declined",
            "interaction.declined.title", "interaction.body.declined", it.id,
            name=actor_name)
    return _serialize(db, it)


@router.post("/{interaction_id}/reply", response_model=dict)
def reply_interaction(interaction_id: int, data: InteractionReplyIn, db: Session = Depends(get_db),
                      current=Depends(require_user)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    _assert_interaction_access(db, current, it)
    if tenancy.enforced():
        data.user_id = current.id
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

    author_name = _name(db, data.user_id) or i18n.t("interaction.fallback.member")
    # Уведомляем остальных участников (не автора).
    for uid in (allowed - {data.user_id}):
        if uid:
            _notify(db, uid, "interaction_reply", "interaction.newReply",
                    "interaction.body.fromTopic", it.id, name=author_name,
                    topic=it.topic or "")
    return _serialize(db, it)


@router.post("/{interaction_id}/close", response_model=dict)
def close_interaction(interaction_id: int, data: InteractionClose, db: Session = Depends(get_db),
                      current=Depends(require_user)):
    it = db.query(Interaction).filter(Interaction.id == interaction_id).first()
    if not it:
        raise HTTPException(status_code=404, detail="Interaction not found")
    _assert_interaction_access(db, current, it)
    if tenancy.enforced():
        data.user_id = current.id
    allowed = {it.from_user_id, it.to_user_id, *[p.user_id for p in it.participants]}
    if data.user_id not in allowed:
        raise HTTPException(status_code=403, detail="Not a participant")
    it.status = "completed"
    if data.outcome:
        it.outcome = data.outcome
    db.commit(); db.refresh(it)
    return _serialize(db, it)
