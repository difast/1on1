from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.support_ticket import SupportTicket
from app.models.ticket_message import TicketMessage
from app.models.user import User
from app.utils.auth import require_user, require_admin
from app.services import tenancy


def _assert_ticket_owner(current, ticket) -> None:
    """Тикет поддержки принадлежит одному пользователю. Обращения к чужому тикету
    (в т.ч. коллеги из той же организации) запрещены — 404. Персонал отвечает
    через админ-эндпоинты (require_admin)."""
    if tenancy.enforced() and current is not None and current.id != ticket.user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, LongTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)


router = APIRouter()

# ── Schemas ──────────────────────────────────────────────────

class TicketCreate(BaseModel):
    user_id: EntityId
    subject: ShortStr
    body: LongTextStr

class MessageOut(BaseModel):
    id: int
    sender: str
    body: str
    created_at: datetime
    class Config:
        from_attributes = True

class TicketOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    user_role: str
    subject: str
    body: str
    read_by_admin: bool
    has_unread_reply: bool
    created_at: datetime
    messages: List[MessageOut] = []
    class Config:
        from_attributes = True

class ReplyCreate(BaseModel):
    body: LongTextStr

# ── Helpers ───────────────────────────────────────────────────

def _out(ticket: SupportTicket, user: Optional[User]) -> dict:
    return {
        "id": ticket.id,
        "user_id": ticket.user_id,
        "user_name": user.name if user else "—",
        "user_email": user.email if user else "—",
        "user_role": user.role if user else "—",
        "subject": ticket.subject,
        "body": ticket.body,
        "read_by_admin": ticket.read_by_admin,
        "has_unread_reply": ticket.has_unread_reply,
        "created_at": ticket.created_at,
        "messages": [{"id": m.id, "sender": m.sender, "body": m.body, "created_at": m.created_at}
                     for m in (ticket.messages or [])],
    }

# ── Endpoints ─────────────────────────────────────────────────

@router.post("/", response_model=TicketOut)
def create_ticket(data: TicketCreate, db: Session = Depends(get_db),
                  current=Depends(require_user)):
    # Тикет создаётся от имени текущего пользователя, а не произвольного user_id.
    if tenancy.enforced():
        data.user_id = current.id
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ticket = SupportTicket(user_id=data.user_id, subject=data.subject, body=data.body)
    db.add(ticket)
    db.flush()
    # First message = the original user message
    msg = TicketMessage(ticket_id=ticket.id, sender="user", body=data.body)
    db.add(msg)
    db.commit()
    db.refresh(ticket)
    return _out(ticket, user)

@router.get("/", response_model=List[TicketOut])
def list_tickets(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    # Список ВСЕХ тикетов — только для персонала поддержки (админ-панель).
    tickets = (db.query(SupportTicket)
               .options(joinedload(SupportTicket.messages))
               .order_by(SupportTicket.created_at.desc())
               .all())
    user_map = {u.id: u for u in db.query(User).all()}
    return [_out(t, user_map.get(t.user_id)) for t in tickets]

@router.get("/user/{user_id}", response_model=List[TicketOut])
def list_user_tickets(user_id: int, db: Session = Depends(get_db),
                      current=Depends(require_user)):
    # Пользователь видит только свои тикеты.
    if tenancy.enforced() and current.id != user_id:
        raise HTTPException(status_code=403, detail="Доступ только к своим обращениям")
    tickets = (db.query(SupportTicket)
               .options(joinedload(SupportTicket.messages))
               .filter(SupportTicket.user_id == user_id)
               .order_by(SupportTicket.created_at.desc())
               .all())
    user = db.query(User).filter(User.id == user_id).first()
    return [_out(t, user) for t in tickets]

@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    count = db.query(SupportTicket).filter(SupportTicket.read_by_admin == False).count()
    return {"count": count}

@router.patch("/{ticket_id}/read")
def mark_read(ticket_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.read_by_admin = True
    db.commit()
    return {"ok": True}

@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    db.query(SupportTicket).filter(SupportTicket.read_by_admin == False).update({"read_by_admin": True})
    db.commit()
    return {"ok": True}

@router.post("/{ticket_id}/reply", response_model=TicketOut)
def admin_reply(ticket_id: int, data: ReplyCreate, db: Session = Depends(get_db),
                _admin=Depends(require_admin)):
    ticket = (db.query(SupportTicket)
              .options(joinedload(SupportTicket.messages))
              .filter(SupportTicket.id == ticket_id).first())
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    msg = TicketMessage(ticket_id=ticket_id, sender="admin", body=data.body)
    db.add(msg)
    ticket.has_unread_reply = True
    ticket.read_by_admin = True
    db.commit()
    db.refresh(ticket)
    user = db.query(User).filter(User.id == ticket.user_id).first()
    return _out(ticket, user)

@router.patch("/{ticket_id}/user-read")
def user_read_reply(ticket_id: int, db: Session = Depends(get_db),
                    current=Depends(require_user)):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    _assert_ticket_owner(current, ticket)
    ticket.has_unread_reply = False
    db.commit()
    return {"ok": True}

@router.post("/{ticket_id}/message", response_model=TicketOut)
def user_message(ticket_id: int, data: ReplyCreate, db: Session = Depends(get_db),
                 current=Depends(require_user)):
    """User sends a follow-up message in an existing ticket."""
    ticket = (db.query(SupportTicket)
              .options(joinedload(SupportTicket.messages))
              .filter(SupportTicket.id == ticket_id).first())
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    _assert_ticket_owner(current, ticket)
    msg = TicketMessage(ticket_id=ticket_id, sender="user", body=data.body)
    db.add(msg)
    ticket.read_by_admin = False
    db.commit()
    db.refresh(ticket)
    user = db.query(User).filter(User.id == ticket.user_id).first()
    return _out(ticket, user)
