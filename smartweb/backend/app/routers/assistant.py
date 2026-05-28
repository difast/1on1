from fastapi import APIRouter, HTTPException
from pydantic import BaseModel as PydanticBase
from typing import List
import httpx
from app.prompts import AITUNNEL_KEY, PIT_SYSTEM_PROMPT

router = APIRouter()


class ChatMessage(PydanticBase):
    role: str
    content: str


class ChatRequest(PydanticBase):
    messages: List[ChatMessage]


@router.post("/chat")
def pit_chat(data: ChatRequest):
    messages = [{"role": "system", "content": PIT_SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in data.messages[-12:]]
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3-5-haiku-20241022", "max_tokens": 600, "messages": messages},
            timeout=25,
        )
        body = resp.json()
        if "choices" not in body:
            raise ValueError(f"no choices: {body}")
        reply = body["choices"][0]["message"]["content"]
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI error: {e}")
