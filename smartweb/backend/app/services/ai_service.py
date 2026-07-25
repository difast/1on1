"""Единый слой вызова LLM. Используется обоими AI-интерфейсами (Пит и ONE AI),
чтобы не дублировать интеграцию с моделью и не рассинхронизировать поведение.
Разница между интерфейсами — в системном промпте, глубине контекста и лимите
токенов ответа, а не в источнике данных."""
from typing import List, Dict, Optional


def call_llm(system: str, messages: List[Dict], max_tokens: int = 600) -> Optional[str]:
    """Best-effort вызов модели. Возвращает текст ответа или None при недоступности
    сети — вызывающий код решает, чем заменить (fallback)."""
    try:
        import httpx
        from app.prompts import AITUNNEL_KEY
        payload_messages = [{"role": "system", "content": system}] + messages
        resp = httpx.post(
            "https://api.aitunnel.ru/v1/chat/completions",
            headers={"Authorization": f"Bearer {AITUNNEL_KEY}"},
            json={"model": "claude-3.5-haiku", "max_tokens": max_tokens, "messages": payload_messages},
            timeout=30,
        )
        body = resp.json()
        if "choices" not in body:
            return None
        return body["choices"][0]["message"]["content"]
    except Exception:
        return None
