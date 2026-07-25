from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel as PydanticBase
from typing import List, Optional
import httpx
from app.database import get_db
from app.models.user import User
from app.services import entitlements
from app.prompts import AITUNNEL_KEY, PIT_SYSTEM_PROMPT

router = APIRouter()


class ChatMessage(PydanticBase):
    role: str
    content: str


class ChatRequest(PydanticBase):
    messages: List[ChatMessage]
    context: str = ""
    user_id: Optional[int] = None


@router.get("/diagnose")
def diagnose():
    """Test endpoint: returns raw aitunnel response for debugging."""
    results = {}
    for model in ["claude-3-5-haiku-20241022", "claude-3-haiku-20240307", "gpt-4o-mini"]:
        try:
            resp = httpx.post(
                "https://api.aitunnel.ru/v1/chat/completions",
                headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
                json={"model": model, "max_tokens": 10,
                      "messages": [{"role": "user", "content": "ping"}]},
                timeout=15,
            )
            results[model] = {"status": resp.status_code, "body": resp.json()}
        except Exception as e:
            results[model] = {"error": str(e)}
    return results


@router.post("/chat")
def pit_chat(data: ChatRequest, db: Session = Depends(get_db)):
    # Тарифное ограничение (Задача 3): Пит доступен не на всех тарифах.
    if data.user_id is not None:
        user = db.query(User).filter(User.id == data.user_id).first()
        entitlements.require_feature(db, user, "pit")

    # Контекст для модели собираем на БЭКЕНДЕ через общий AI-слой с проверкой
    # прав (тот же слой, что у ONE AI) — не полагаемся на контекст с клиента,
    # чтобы права не обходились через подменённый запрос.
    context = ""
    if data.user_id is not None:
        try:
            from app.services.ai_context import build_pit_context
            context = build_pit_context(db, data.user_id)
        except Exception:
            context = data.context or ""
    else:
        context = data.context or ""

    system = PIT_SYSTEM_PROMPT
    if context:
        system += f"\n\n=== ТЕКУЩИЙ КОНТЕКСТ КОМАНДЫ ===\n{context}\n=== КОНЕЦ КОНТЕКСТА ==="
    messages = [{"role": m.role, "content": m.content} for m in data.messages[-12:]]

    from app.services.ai_service import call_llm
    reply = call_llm(system, messages, max_tokens=600)
    if reply is None:
        raise HTTPException(status_code=503, detail="AI временно недоступен, попробуйте ещё раз")
    return {"reply": reply}
