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
def pit_chat(data: ChatRequest):
    messages = [{"role": "system", "content": PIT_SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in data.messages[-12:]]
    try:
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": 600, "messages": messages},
            timeout=25,
        )
        body = resp.json()
        if "choices" not in body:
            raise HTTPException(status_code=503, detail=f"aitunnel error: {body}")
        reply = body["choices"][0]["message"]["content"]
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"connection error: {type(e).__name__}: {e}")
