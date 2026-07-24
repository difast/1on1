from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.user import User
from app.services import entitlements
from app.services import ai_context
from app.services.ai_service import call_llm

router = APIRouter()


class OneAiQuery(BaseModel):
    actor_id: int
    section: str
    target_user_id: Optional[int] = None
    team_id: Optional[int] = None
    message: Optional[str] = None


def _enforce_actor(current, actor_id: int):
    if current is not None and current.id != actor_id:
        raise HTTPException(status_code=403, detail="Доступ только от своего имени")


@router.get("/sections")
def sections(actor_id: int = Query(...), db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Доступные разделы ONE AI с учётом роли (тимлид/участник)."""
    _enforce_actor(current, actor_id)
    return {"sections": ai_context.available_sections(db, actor_id)}


@router.post("/query")
def query(data: OneAiQuery, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Стратегический аналитический запрос ONE AI. Права и сбор контекста —
    в общем AI-слое (ai_context) ДО обращения к модели, тот же слой, что у Пита."""
    _enforce_actor(current, data.actor_id)
    actor = db.query(User).filter(User.id == data.actor_id).first()
    # ONE AI — премиальный стратегический инструмент: мягкое тарифное уведомление.
    entitlements.require_feature(db, actor, "pit")

    # Сбор контекста + проверка прав (бросит 403/400 при нарушении).
    context, based_on = ai_context.build_oneai_context(
        db, data.actor_id, data.section,
        target_user_id=data.target_user_id, team_id=data.team_id, query=data.message,
    )

    instruction = ai_context.SECTION_INSTRUCTION.get(data.section, "Проанализируй данные и дай рекомендации.")
    user_msg = instruction
    if data.message:
        user_msg += f"\n\nЗапрос пользователя: {data.message}"
    user_msg += f"\n\n=== ДАННЫЕ (только на них основывай ответ) ===\n{context}\n=== КОНЕЦ ДАННЫХ ==="

    reply = call_llm(ai_context.ONEAI_SYSTEM, [{"role": "user", "content": user_msg}], max_tokens=1100)
    if reply is None:
        raise HTTPException(status_code=503, detail="ONE AI временно недоступен, попробуйте ещё раз")
    return {"reply": reply, "based_on": based_on}
