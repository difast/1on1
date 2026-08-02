from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel as PydanticBase
from typing import List, Optional
from app.database import get_db
from app.models.user import User
from app.services import entitlements
from app.prompts import PIT_SYSTEM_PROMPT
from app.services import ai_text

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
    """Диагностика AI Gateway: делает минимальный запрос через общий AI-слой и
    сообщает результат. Ключ не выводится — только статус и имя модели."""
    from app.config import settings
    from app.services import ai_service
    info = {
        "provider": "ai_gateway",
        "base_url": settings.ai_gateway_base_url,
        "model": settings.ai_gateway_model,
        "key_configured": bool(settings.ai_gateway_key),
    }
    try:
        reply = ai_service.complete(
            [{"role": "user", "content": "ping"}], max_tokens=10, timeout=15,
        )
        info["status"] = "ok"
        info["sample"] = (reply or "")[:80]
    except ai_service.AIConfigError:
        info["status"] = "not_configured"
    except ai_service.AIServiceError as e:
        info["status"] = "error"
        info["error_type"] = type(e).__name__
    return info


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
    # Промпт запрещает разметку, но модель не всегда следует инструкции —
    # подчищаем остатки, чтобы символы * и # не попали в интерфейс.
    if reply is not None:
        reply = ai_text.strip_markdown(reply)
    if reply is None:
        raise HTTPException(status_code=503, detail="AI временно недоступен, попробуйте ещё раз")
    return {"reply": reply}
