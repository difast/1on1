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


def _extract_usage(resp, payload, content: str) -> tuple[int, int]:
    """Токены запроса/ответа из ответа шлюза (OpenAI-совместимый usage).
    Если провайдер usage не вернул — грубая оценка по длине текста (~4 симв/токен),
    чтобы учёт себестоимости работал независимо от провайдера."""
    try:
        u = getattr(resp, "usage", None)
        if u is not None:
            pt = getattr(u, "prompt_tokens", None)
            ct = getattr(u, "completion_tokens", None)
            if pt is not None and ct is not None:
                return int(pt), int(ct)
    except Exception:
        pass
    in_chars = sum(len(str(m.get("content") or "")) for m in payload)
    return max(1, in_chars // 4), max(1, len(content or "") // 4)


def complete(messages: List[Dict], max_tokens: int = 600,
             system: Optional[str] = None, timeout: float = 30.0,
             meter: Optional[Dict] = None) -> str:
    """Вызов модели через Gateway. Возвращает текст ответа.

    meter (опционально) — контекст учёта себестоимости и квоты:
        {"db": Session, "user": User, "feature": str, "team_id": int|None}.
    Если передан, здесь централизованно (единая точка для ВСЕХ AI-функций):
      - при исчерпании AI-бюджета запрос выполняется в урезанном режиме (меньше
        max_tokens, обрезанный контекст) вместо полной блокировки (2.5);
      - после ответа фиксируется фактическая себестоимость в журнале (2.1).

    Бросает AIConfigError, если AI_GATEWAY_KEY не задан, и AIServiceError при
    сетевой ошибке, недоступности шлюза, неверном ключе или исчерпании лимита."""
    payload = ([{"role": "system", "content": system}] if system else []) + list(messages)
    eff_max = max_tokens
    degraded = False
    if meter:
        try:
            from app.services import ai_billing
            plan = ai_billing.degraded_plan(meter["db"], meter.get("user"))
            if plan["degraded"]:
                degraded = True
                eff_max = min(max_tokens, plan["max_tokens"])
                keep = plan["keep_last_messages"] or 1
                head = [payload[0]] if system else []
                payload = head + payload[len(head):][-keep:]
        except Exception:
            pass
    try:
        client = _get_client()
        resp = client.with_options(timeout=timeout).chat.completions.create(
            model=settings.ai_gateway_model,
            max_tokens=eff_max,
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
    if meter:
        try:
            from app.services import ai_billing
            in_tok, out_tok = _extract_usage(resp, payload, content)
            ai_billing.record_usage(meter["db"], user=meter.get("user"),
                                    feature=meter.get("feature", "other"),
                                    input_tokens=in_tok, output_tokens=out_tok,
                                    model=settings.ai_gateway_model,
                                    team_id=meter.get("team_id"), degraded=degraded)
        except Exception:
            # Учёт не должен ронять сам AI-ответ.
            log.warning("AI usage accounting failed (non-fatal)")
    return content


def call_llm(system: str, messages: List[Dict], max_tokens: int = 600,
             meter: Optional[Dict] = None) -> Optional[str]:
    """Best-effort вызов модели. Возвращает текст ответа или None, если модель
    недоступна (сеть/шлюз) либо ключ не задан — вызывающий код сам решает, чем
    заменить (fallback). meter — как в complete().

    None здесь НИКОГДА не означает работу на скрытом ключе: без AI_GATEWAY_KEY
    вызов сразу возвращает None и пишет предупреждение в лог, а не идёт на
    встроенный дефолт."""
    try:
        return complete(messages, max_tokens=max_tokens, system=system, meter=meter)
    except AIConfigError:
        log.warning("AI-функция вызвана без AI_GATEWAY_KEY — ответ недоступен")
        return None
    except AIError:
        return None
