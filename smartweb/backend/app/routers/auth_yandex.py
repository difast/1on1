"""Вход/регистрация через Yandex ID (калька с Telegram-входа).

  GET  /api/auth/yandex/config     — включён ли способ входа (для кнопки)
  GET  /api/auth/yandex/authorize  — URL страницы согласия Yandex ID
  POST /api/auth/yandex/callback   — обмен code на токен, профиль, JWT

Email/пароль и Telegram-вход не затрагиваются: это дополнительный способ входа,
использующий ту же выдачу JWT (utils.auth.create_access_token) и тот же
CSRF-state (services.oauth_state), что и остальные потоки.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.user import UserOut
from app.utils.auth import create_access_token, get_current_user
from app.services import oauth_state, yandex_auth, yandex_id

router = APIRouter()
log = logging.getLogger("auth_yandex")

# Имя потока в state. Намеренно отличается от "yandex" календарной интеграции:
# state одного потока не подойдёт для другого.
STATE_FLOW = "yandex_login"
# Страница согласия живёт недолго: 15 минут с запаса хватает, дальше state
# считаем протухшим.
STATE_MAX_AGE = 15 * 60


@router.get("/config")
def yandex_config():
    """Публичные данные для отрисовки кнопки (без секретов)."""
    return {"enabled": yandex_id.is_configured()}


@router.get("/authorize")
def authorize(platform: str = Query("web", pattern="^(web|mobile)$"),
              link_user_id: int | None = Query(None),
              current=Depends(get_current_user)):
    """URL страницы согласия Yandex ID. platform=mobile отдаёт URL с deep-link
    redirect URI (возврат в приложение по схеме oneonone://)."""
    if not yandex_id.is_configured():
        raise HTTPException(status_code=400, detail={
            "code": "provider_not_configured",
            "message": "Вход через Яндекс ID ещё не настроен администратором.",
        })
    # Привязка Yandex ID к уже существующему аккаунту разрешена только его
    # владельцу — user_id берём из токена, не с клиента.
    user_id = 0
    if link_user_id is not None:
        if current is None or current.id != link_user_id:
            raise HTTPException(status_code=401, detail="Не авторизовано")
        user_id = current.id
    state = oauth_state.make_state(user_id, STATE_FLOW)
    return {"url": yandex_id.authorize_url(state, platform), "state": state}


class CallbackReq(BaseModel):
    code: str
    state: str


@router.post("/callback")
def callback(data: CallbackReq, db: Session = Depends(get_db)):
    """Завершить вход: code -> токен -> профиль Yandex ID -> find-or-create
    пользователя -> наш JWT (тот же, что у email- и Telegram-входа)."""
    link_user_id = oauth_state.read_state(data.state, STATE_FLOW, max_age=STATE_MAX_AGE)
    if link_user_id is None:
        raise HTTPException(status_code=400, detail="Недействительный state")

    try:
        tokens = yandex_id.exchange_code(data.code)
        profile = yandex_id.profile_from_token(
            tokens.get("access_token"), tokens.get("scope"),
        )
    except yandex_id.YandexAuthError:
        raise HTTPException(status_code=400, detail="Не удалось войти через Яндекс ID. Попробуйте ещё раз.")
    except Exception as e:
        log.warning("yandex id oauth error: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Яндекс ID временно недоступен. Попробуйте позже.")

    try:
        user, status = yandex_auth.resolve_login(
            db, profile, link_user_id=link_user_id or None,
        )
    except ValueError as e:
        reason = str(e)
        if reason == "yandex_in_use":
            raise HTTPException(status_code=409, detail="Этот Яндекс ID уже привязан к другому аккаунту.")
        if reason == "email_in_use":
            raise HTTPException(status_code=409, detail=(
                "К аккаунту с этой почтой уже привязан другой Яндекс ID. "
                "Войдите тем Яндекс ID или по email и паролю."
            ))
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    return {
        "status": status,
        "user": UserOut.model_validate(user).model_dump(),
        "token": create_access_token(user.id),
    }
