"""Telegram-авторизация: вход через Login Widget, Mini App, привязка по коду.

Приём апдейтов бота живёт в отдельном приложении smartweb/telegram-bot.

Email/пароль остаётся основным способом входа — здесь только дополнение.
Единый идентификатор — users.telegram_id; для одного человека не создаём два
профиля (см. attach_telegram_to_user / resolve_web_login в services.telegram).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.telegram import TelegramLinkRequest
from app.schemas.user import UserOut
from app.utils.auth import create_access_token
from app.services import telegram as tg

router = APIRouter()


@router.get("/config")
def tg_config():
    """Публичные данные для рендера виджета на фронте (без секретов)."""
    return {
        "bot_username": settings.telegram_bot_username or "",
        "enabled": bool(settings.telegram_bot_token and settings.telegram_bot_username),
    }


# ---- Вебхук бота -----------------------------------------------------------
# Приём апдейтов Telegram живёт в ОТДЕЛЬНОМ приложении smartweb/telegram-bot:
# у входящего канала должен быть один владелец, иначе Telegram шлёт апдейты на
# один URL, а второе приложение молча перерегистрирует вебхук на себя.
# Здесь остаются только эндпоинты для веба и приложения (Mini App, Login Widget,
# привязка по коду) — их вызывают наши клиенты, а не Telegram.

# ---- Вход в Mini App через initData (Этап 1) --------------------------------

class MiniAppAuth(BaseModel):
    init_data: str


@router.post("/miniapp-auth")
def miniapp_auth(data: MiniAppAuth, db: Session = Depends(get_db)):
    """Авторизация Mini App: проверяем initData (та же идея, что и Login Widget,
    другая формула ключа) и входим/создаём аккаунт тем же resolve_web_login."""
    tg_data = tg.verify_init_data(data.init_data)
    if not tg_data:
        raise HTTPException(status_code=401, detail="Не удалось проверить Telegram initData")
    user, status = tg.resolve_web_login(db, tg_data)
    # Выдаём наш JWT, чтобы Mini App слал Bearer как и остальные клиенты (Этап 8).
    return {"status": status, "user": UserOut.model_validate(user).model_dump(),
            "token": create_access_token(user.id)}


# ---- Вход через Login Widget ------------------------------------------------

class WidgetAuth(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str
    link_user_id: Optional[int] = None  # если задан — привязать к этому аккаунту


@router.post("/callback")
def widget_callback(data: WidgetAuth, db: Session = Depends(get_db)):
    """Вход/регистрация через Telegram Login Widget. Сначала проверяем hash
    (Этап 5), затем ищем/создаём/привязываем аккаунт (Этапы 2-4)."""
    payload = data.model_dump(exclude_none=True)
    link_user_id = payload.pop("link_user_id", None)
    # В проверку hash идут только поля от Telegram (без наших добавок).
    if not tg.verify_login_widget(payload):
        raise HTTPException(status_code=401, detail="Не удалось проверить подлинность Telegram")

    tg_data = {
        "id": data.id, "first_name": data.first_name,
        "username": data.username, "photo_url": data.photo_url,
    }
    try:
        user, status = tg.resolve_web_login(db, tg_data, link_user_id=link_user_id)
    except ValueError as e:
        if str(e) == "telegram_in_use":
            raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту с данными.")
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    # Выдаём наш JWT — Telegram-вход на вебе шлёт Bearer как email-вход (Этап 8).
    return {"status": status, "user": UserOut.model_validate(user).model_dump(),
            "token": create_access_token(user.id)}


# ---- Привязка по коду (из бота) --------------------------------------------

class LinkByCode(BaseModel):
    user_id: int
    code: str


@router.post("/link")
def link_by_code(data: LinkByCode, db: Session = Depends(get_db)):
    """Привязать Telegram к текущему аккаунту по коду, выданному ботом (Этап 4)."""
    code = (data.code or "").strip().upper()
    req = db.query(TelegramLinkRequest).filter(
        TelegramLinkRequest.code == code,
        TelegramLinkRequest.consumed == False,  # noqa: E712
    ).first()
    if not req or req.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Код недействителен или истёк")
    target = db.query(User).filter(User.id == data.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    tg_data = {"id": req.telegram_id, "first_name": req.first_name,
               "username": req.username, "photo_url": req.photo_url}
    try:
        tg.attach_telegram_to_user(db, target, tg_data)
    except ValueError:
        raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту с данными.")
    req.consumed = True
    db.commit()
    return {"status": "linked", "user": UserOut.model_validate(target).model_dump()}
