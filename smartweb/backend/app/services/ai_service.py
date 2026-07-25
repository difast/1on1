"""Единый слой вызова LLM через OpenAI-совместимый AI Gateway (Timeweb AI).

Все AI-функции продукта (Пит, ONE AI, декомпозиция задач, подбор слотов,
анализ настроения, советы по развитию) обращаются к модели ТОЛЬКО через этот
модуль. Здесь одна точка конфигурации (ключ, base_url, модель), одна модель на
весь продукт (settings.ai_gateway_model) и единая обработка ошибок.

Безопасность: ключ читается из окружения (AI_GATEWAY_KEY) и НИКОГДА не пишется
в логи и не возвращается клиенту. Скрытого дефолтного ключа нет — если ключ не
задан, вызов поднимает AIConfigError (явная ошибка конфигурации), а не работает
молча на встроенном ключе.
"""
from typing import List, Dict, Optional
import logging

from app.config import settings

log = logging.getLogger("ai")


class AIError(Exception):
    """Базовая ошибка AI-слоя."""


class AIConfigError(AIError):
    """AI_GATEWAY_KEY не задан — использовать AI-функции нельзя."""


class AIServiceError(AIError):
    """Шлюз недоступен или вернул ошибку (сеть, неверный ключ, исчерпан лимит)."""


_client = None


def _get_client():
    """Ленивая инициализация OpenAI-совместимого клиента на AI Gateway.
    Клиент кэшируется. Без ключа — сразу AIConfigError (без дефолта)."""
    global _client
    if not settings.ai_gateway_key:
        raise AIConfigError("AI_GATEWAY_KEY не задан")
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(
            api_key=settings.ai_gateway_key,
            base_url=settings.ai_gateway_base_url,
        )
    return _client


def complete(messages: List[Dict], max_tokens: int = 600,
             system: Optional[str] = None, timeout: float = 30.0) -> str:
    """Вызов модели через Gateway. Возвращает текст ответа.

    Бросает AIConfigError, если AI_GATEWAY_KEY не задан, и AIServiceError при
    сетевой ошибке, недоступности шлюза, неверном ключе или исчерпании лимита."""
    payload = ([{"role": "system", "content": system}] if system else []) + list(messages)
    try:
        client = _get_client()
        resp = client.with_options(timeout=timeout).chat.completions.create(
            model=settings.ai_gateway_model,
            max_tokens=max_tokens,
            messages=payload,
        )
    except AIConfigError:
        raise
    except Exception as e:
        # Логируем только тип ошибки — ни ключа, ни тела запроса.
        log.warning("AI gateway error: %s", type(e).__name__)
        raise AIServiceError(type(e).__name__)
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise AIServiceError("empty response")
    return content


def call_llm(system: str, messages: List[Dict], max_tokens: int = 600) -> Optional[str]:
    """Best-effort вызов модели. Возвращает текст ответа или None, если модель
    недоступна (сеть/шлюз) либо ключ не задан — вызывающий код сам решает, чем
    заменить (fallback).

    None здесь НИКОГДА не означает работу на скрытом ключе: без AI_GATEWAY_KEY
    вызов сразу возвращает None и пишет предупреждение в лог, а не идёт на
    встроенный дефолт."""
    try:
        return complete(messages, max_tokens=max_tokens, system=system)
    except AIConfigError:
        log.warning("AI-функция вызвана без AI_GATEWAY_KEY — ответ недоступен")
        return None
    except AIError:
        return None
