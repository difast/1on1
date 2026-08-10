from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteUpdate, NoteOut
from app.utils.auth import require_user
from app.services import tenancy

router = APIRouter()


def _assert_note_owner(current, user_id: int) -> None:
    """Заметки — личные записи автора: доступ только владельцу (Блок 2). Тимлид
    не читает личные заметки участника — это не командные данные."""
    if tenancy.enforced() and current.id != user_id:
        raise HTTPException(status_code=403, detail="Доступ только к своим заметкам")


@router.get("/", response_model=List[NoteOut])
def list_notes(user_id: int = Query(...), db: Session = Depends(get_db),
               current=Depends(require_user)):
    _assert_note_owner(current, user_id)
    return (
        db.query(Note)
        .filter(Note.user_id == user_id)
        .order_by(Note.created_at.desc())
        .all()
    )


@router.post("/", response_model=NoteOut)
def create_note(data: NoteCreate, db: Session = Depends(get_db),
                current=Depends(require_user)):
    payload = data.model_dump()
    # В жёстком режиме автор заметки — текущий пользователь из токена (нельзя
    # создать заметку в чужой организации). Вне жёсткого режима поведение
    # прежнее (user_id из тела) — безопасный поэтапный раскат.
    if tenancy.enforced():
        payload["user_id"] = current.id
    note = Note(**payload)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db),
                current=Depends(require_user)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if tenancy.enforced() and current.id != note.user_id:
        raise HTTPException(status_code=404, detail="Note not found")
    note.content = data.content
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db),
                current=Depends(require_user)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if tenancy.enforced() and current.id != note.user_id:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}
