from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteUpdate, NoteOut

router = APIRouter()


@router.get("/", response_model=List[NoteOut])
def list_notes(user_id: int = Query(...), db: Session = Depends(get_db)):
    return (
        db.query(Note)
        .filter(Note.user_id == user_id)
        .order_by(Note.created_at.desc())
        .all()
    )


@router.post("/", response_model=NoteOut)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    note = Note(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.content = data.content
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}
