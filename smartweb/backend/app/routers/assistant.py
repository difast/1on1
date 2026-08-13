from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel as PydanticBase, Field, StringConstraints, field_validator
from typing import Annotated, List, Literal, Optional
from app.database import get_db
from app.models.user import User
from app.services import entitlements
from app.prompts import PIT_SYSTEM_PROMPT
from app.services import ai_text
from app.utils.auth import require_user, require_admin
from app.utils import ratelimit

router = APIRouter()

# Границы диалога с Питом. Смысл — не в том, чтобы стеснить пользователя
# (реплика в 4000 символов заведомо длиннее любого живого вопроса), а в том,
# что без границ один запрос уносит в модель сколько угодно текста: это и
# нагрузка на процесс, и прямые деньги за токены AI Gateway.
MAX_MESSAGE_CHARS = 4000
# В модель уходят только последние REPLY_WINDOW реплик, но клиент присылает всю
# накопленную переписку, поэтому потолок взят с большим запасом: длинный диалог
# с Питом не должен упереться в ошибку прямо посреди разговора.
MAX_MESSAGES = 200
MAX_HISTORY_CHARS = 120000
# Сколько последних реплик реально отправляем модели.
REPLY_WINDOW = 12


class ChatMessage(PydanticBase):
    # ТОЛЬКО роли участника диалога. Раньше поле было произвольной строкой, и
    # клиент мог прислать role="system" — то есть дописать модели собственную
    # системную инструкцию поверх нашей и обойти правила ассистента. Теперь
    # системное сообщение формирует исключительно сервер.
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=MAX_MESSAGE_CHARS)]


class ChatRequest(PydanticBase):
    messages: Annotated[List[ChatMessage], Field(min_length=1, max_length=MAX_MESSAGES)]
    # Контекст с клиента больше не подмешивается в системный промпт: он
    # собирается на сервере (build_pit_context) с проверкой прав. Поле
    # оставлено для совместимости со старыми сборками приложения, но
    # игнорируется — иначе через него переопределялись бы инструкции.
    context: Annotated[str, StringConstraints(max_length=2000)] = ""
    user_id: Optional[Annotated[int, Field(ge=1)]] = None

    @field_validator("messages")
    @classmethod
    def _limit_total(cls, v):
        """Суммарный объём истории тоже ограничен: тридцать сообщений по
        четыре тысячи символов дали бы 120 000 символов в одном запросе."""
        total = sum(len(m.content) for m in v)
        if total > MAX_HISTORY_CHARS:
            raise ValueError(f"Слишком длинная история диалога (максимум {MAX_HISTORY_CHARS} символов)")
        return v


@router.get("/diagnose")
def diagnose(_admin=Depends(require_admin)):
    """Диагностика AI Gateway: делает минимальный запрос через общий AI-слой и
    сообщает результат. Ключ не выводится — только статус и имя модели.

    Только для администратора: эндпоинт обращается к платной модели и заодно
    раскрывает адрес шлюза и имя модели."""
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
def pit_chat(data: ChatRequest, request: Request,
             db: Session = Depends(get_db), current=Depends(require_user)):
    """Диалог с Питом.

    Требует авторизации. Раньше эндпоинт был открыт: user_id приходил в теле
    запроса, при его отсутствии тарифная проверка пропускалась целиком, и любой
    желающий мог обращаться к модели за наш счёт.

    Личность пользователя берём из токена, а не из тела запроса — иначе можно
    было подставить чужой user_id и получить чужой контекст.
    """
    ratelimit.check(ratelimit.AI_USER, str(current.id))
    ratelimit.check(ratelimit.AI_USER_HOURLY, str(current.id))

    # Тарифное ограничение (Задача 3): Пит доступен не на всех тарифах.
    entitlements.require_feature(db, current, "pit")

    # Контекст для модели собираем на БЭКЕНДЕ через общий AI-слой с проверкой
    # прав (тот же слой, что у ONE AI). Контекст с клиента не используем вовсе:
    # он не проверяем и через него переопределялись бы системные инструкции.
    try:
        from app.services.ai_context import build_pit_context
        context = build_pit_context(db, current.id)
    except Exception:
        context = ""

    system = PIT_SYSTEM_PROMPT
    if context:
        system += f"\n\n=== ТЕКУЩИЙ КОНТЕКСТ КОМАНДЫ ===\n{context}\n=== КОНЕЦ КОНТЕКСТА ==="
    messages = [{"role": m.role, "content": m.content} for m in data.messages[-REPLY_WINDOW:]]

    from app.services.ai_service import call_llm
    reply = call_llm(system, messages, max_tokens=600,
                     meter={"db": db, "user": current, "feature": "pit"})
    # Промпт запрещает разметку, но модель не всегда следует инструкции —
    # подчищаем остатки, чтобы символы * и # не попали в интерфейс.
    if reply is not None:
        reply = ai_text.strip_markdown(reply)
    if reply is None:
        raise HTTPException(status_code=503, detail="AI временно недоступен, попробуйте ещё раз")
    return {"reply": reply}
