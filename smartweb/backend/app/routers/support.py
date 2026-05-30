from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.support_ticket import SupportTicket
from app.models.user import User

router = APIRouter()

class TicketCreate(BaseModel):
    user_id: int
    subject: str
    body: str

class TicketOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    user_role: str
    subject: str
    body: str
    read_by_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True

@router.post("/", response_model=TicketOut)
def create_ticket(data: TicketCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ticket = SupportTicket(user_id=data.user_id, subject=data.subject, body=data.body)
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return _out(ticket, user)

@router.get("/", response_model=List[TicketOut])
def list_tickets(db: Session = Depends(get_db)):
    tickets = db.query(SupportTicket).order_by(SupportTicket.created_at.desc()).all()
    user_map = {u.id: u for u in db.query(User).all()}
    return [_out(t, user_map.get(t.user_id)) for t in tickets]

@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db)):
    count = db.query(SupportTicket).filter(SupportTicket.read_by_admin == False).count()
    return {"count": count}

@router.patch("/{ticket_id}/read")
def mark_read(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.read_by_admin = True
    db.commit()
    return {"ok": True}

@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db)):
    db.query(SupportTicket).filter(SupportTicket.read_by_admin == False).update({"read_by_admin": True})
    db.commit()
    return {"ok": True}

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
        "created_at": ticket.created_at,
    }
