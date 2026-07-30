"""Telegram-бот как отдельное приложение (отдельный деплой на Timeweb).

Зачем отдельно: бот больше не конкурирует с API за CPU и потоки, перезапускается
независимо и гарантированно работает в одном экземпляре. Приём апдейтов живёт
ТОЛЬКО здесь — в API маршрута вебхука больше нет, режим polling удалён совсем.

Дубликатов логики нет: вся обработка команд — это app.services.telegram_bot,
модели, БД и словари импортируются из бэкенда как есть. Здесь только транспорт:
проверка секретного заголовка, сессия БД, вызов handle_update.
"""
import logging
import os
import sys
from pathlib import Path

# Пакет app лежит в соседней папке backend. Путь считаем от файла, а не от
# рабочей директории: на Timeweb корень сборки у этого приложения свой.
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import Depends, FastAPI, Header, HTTPException, Request  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import get_db  # noqa: E402
from app.services import telegram as tg  # noqa: E402
from app.utils.auth import require_admin  # noqa: E402

log = logging.getLogger("telegram.bot")


def _public_url() -> str:
    """Публичный адрес ЭТОГО приложения — на него Telegram шлёт апдейты.
    Это не APP_WEB_URL (тот ведёт на веб-интерфейс) и не адрес API."""
    return (settings.bot_public_url or os.getenv("BOT_PUBLIC_URL") or "").rstrip("/")


def _expected_webhook() -> str:
    base = _public_url()
    return f"{base}/webhook" if base else ""


def _ensure_webhook() -> dict:
    """Сверить регистрацию вебхука с Telegram и перерегистрировать при
    расхождении. setWebhook идемпотентен и сам заменяет прежний URL, поэтому
    отдельно снимать старый вебхук не нужно."""
    expected = _expected_webhook()
    if not expected:
        log.warning("BOT_PUBLIC_URL не задан — вебхук не зарегистрирован")
        return {"ok": False, "error": "no_public_url"}
    if not tg.bot_token():
        log.warning("TELEGRAM_BOT_TOKEN не задан — вебхук не зарегистрирован")
        return {"ok": False, "error": "no_token"}
    info = tg.get_webhook_info()
    result = (info or {}).get("result") or {}
    current = result.get("url") or ""
    last_error = result.get("last_error_message") or ""
    if current == expected and not last_error:
        log.info("вебхук уже зарегистрирован: %s", current)
        return {"ok": True, "changed": False, "url": current}
    log.warning("перерегистрируем вебхук: было %r, ошибка %r", current, last_error)
    res = tg.set_webhook(expected)
    log.info("setWebhook -> %s", res)
    return {"ok": bool(res.get("ok")), "changed": True, "url": expected, "telegram": res}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Регистрацию вебхука чинит только это приложение — единственный владелец.
    # Миграции здесь НЕ запускаем: схему ведёт API, два alembic-процесса
    # подрались бы за блокировку alembic_version.
    import asyncio
    async def setup():
        await asyncio.sleep(5)  # дать порту открыться, иначе Telegram упрётся в 502
        try:
            await asyncio.to_thread(_ensure_webhook)
        except Exception as e:
            log.warning("проверка вебхука не удалась: %s", e)
    task = asyncio.create_task(setup())
    yield
    task.cancel()


app = FastAPI(title="OneOnOne Telegram Bot", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    """Health-check для платформы. Секретов не отдаём."""
    return {"status": "ok", "service": "telegram-bot", "has_token": bool(tg.bot_token())}


@app.post("/webhook")
async def webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(None),
):
    """Единственная точка приёма апдейтов Telegram."""
    if not tg.verify_webhook_secret(x_telegram_bot_api_secret_token):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = await request.json()
    try:
        from app.services import telegram_bot
        telegram_bot.handle_update(db, update)
    except Exception:
        # Никогда не роняем вебхук: иначе Telegram уйдёт в ретраи и накопит очередь.
        log.exception("handle_update error")
    return {"ok": True}


@app.get("/admin/webhook-info")
def webhook_info(_admin=Depends(require_admin)):
    """Диагностика доставки: что о вебхуке думает сам Telegram."""
    result = (tg.get_webhook_info() or {}).get("result") or {}
    return {
        "has_token": bool(tg.bot_token()),
        "secret_source": "env" if (settings.telegram_webhook_secret or "").strip() else (
            "derived" if tg.bot_token() else "none"),
        "expected_url": _expected_webhook(),
        "telegram_url": result.get("url") or "",
        "pending_update_count": result.get("pending_update_count"),
        "last_error_message": result.get("last_error_message") or "",
        "last_error_date": result.get("last_error_date"),
    }


@app.post("/admin/set-webhook")
def set_webhook(_admin=Depends(require_admin)):
    """Принудительная перерегистрация вебхука на адрес этого приложения."""
    return _ensure_webhook()
