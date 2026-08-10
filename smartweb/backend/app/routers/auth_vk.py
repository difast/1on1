"""Вход/регистрация через VK ID (калька с auth_yandex.py).

  GET  /api/auth/vk/config    — включён ли способ + публичные параметры SDK
  POST /api/auth/vk/callback  — обмен code/device_id на токен НА БЭКЕНДЕ,
                                профиль VK ID, find-or-create User, наш JWT

Email/пароль, Telegram и Yandex ID не затрагиваются: это дополнительный способ
входа, использующий ту же выдачу JWT (utils.auth.create_access_token) и ту же
политику связывания по email, что и Yandex ID.

CSRF-state отдельно не выпускаем: VK ID SDK защищает поток встроенным PKCE
(code_challenge/code_verifier) — дублировать не нужно (Этап 1 задачи).
"""
import logging
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.user import UserOut
from app.utils.auth import create_access_token
from app.services import vk_auth, vk_id
from app.utils.validation import TokenStr, OptShortStr
from app.config import settings

router = APIRouter()
log = logging.getLogger("auth_vk")

# Токены VK ID длиннее наших: access_token может быть в несколько килобайт,
# поэтому обычный TokenStr (512) сюда не годится — из-за него запрос отлетал
# на валидации с 422 ещё до обработчика.
VkTokenStr = Annotated[str, StringConstraints(max_length=8192)]


@router.get("/config")
def vk_config():
    """Публичные параметры для инициализации виджета VK ID SDK на фронте.
    Секрет приложения (client_secret) сюда НЕ попадает."""
    return {
        "enabled": vk_id.is_configured(),
        "app_id": settings.vk_app_id or "",
        "redirect_url": settings.vk_login_web_redirect,
        "scope": vk_id.LOGIN_SCOPES,
        # Домен VK ID для виджета (__vkidDomain). Держим тем же, что у серверного
        # обмена, чтобы фронт и бэк не разъезжались по vk.ru / vk.com.
        "id_domain": settings.vk_id_host,
    }


class CallbackReq(BaseModel):
    # Основной путь: фронт УЖЕ обменял код на токен официальным методом SDK
    # (VKID.Auth.exchangeCode — публичный клиент + PKCE, секрет не участвует) и
    # прислал access_token. По нему мы сами сходим в user_info и выдадим JWT.
    access_token: Optional[VkTokenStr] = None
    # user_id VK ID SDK отдаёт ЧИСЛОМ — принимаем и число, и строку. На бэкенде
    # он не используется (профиль берём из user_info), поэтому валидируем мягко.
    user_id: Optional[Union[int, str]] = None
    # Запасной путь (конфиденциальные приложения): обмен кода на бэкенде.
    code: Optional[VkTokenStr] = None
    device_id: Optional[TokenStr] = None
    code_verifier: Optional[VkTokenStr] = None
    state: OptShortStr = None
    # "web" — вернуть JWT в JSON; "mobile" — вернуть ещё и адрес возврата в
    # приложение, чтобы веб-страница-мост перебросила результат по схеме.
    platform: OptShortStr = None


@router.post("/callback")
def callback(data: CallbackReq, db: Session = Depends(get_db)):
    """Завершить вход: code/device_id -> access_token (обмен на бэкенде по
    client_secret) -> профиль VK ID -> find-or-create -> наш JWT (тот же, что у
    email-, Telegram- и Yandex-входа)."""
    if not vk_id.is_configured():
        raise HTTPException(status_code=400, detail={
            "code": "provider_not_configured",
            "message": "Вход через VK ID ещё не настроен администратором.",
        })

    try:
        if data.access_token:
            # Основной путь: токен уже получен на клиенте (PKCE). Сами берём
            # профиль в user_info (это же валидирует токен: VK отдаст данные
            # только для нашего client_id) и выдаём JWT.
            info = vk_id.fetch_user_info(data.access_token)
            profile = vk_id.profile_from_auth({}, info)
        elif data.code and data.device_id:
            # Запасной путь: обмен кода на бэкенде (для конфиденциальных приложений).
            tokens = vk_id.exchange_code(
                data.code, data.device_id,
                code_verifier=data.code_verifier, state=data.state,
            )
            info = vk_id.fetch_user_info(tokens.get("access_token"))
            profile = vk_id.profile_from_auth(tokens, info)
        else:
            raise HTTPException(status_code=400, detail="Не переданы данные VK ID для входа.")
    except vk_id.VkAuthError:
        raise HTTPException(status_code=400, detail="Не удалось войти через VK ID. Попробуйте ещё раз.")
    except HTTPException:
        raise
    except Exception as e:
        log.warning("vk id oauth error: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="VK ID временно недоступен. Попробуйте позже.")

    try:
        user, status = vk_auth.resolve_login(db, profile)
    except ValueError as e:
        reason = str(e)
        if reason == "vk_in_use":
            raise HTTPException(status_code=409, detail="Этот VK ID уже привязан к другому аккаунту.")
        if reason == "email_in_use":
            raise HTTPException(status_code=409, detail=(
                "К аккаунту с этой почтой уже привязан другой VK ID. "
                "Войдите тем VK ID или по email и паролю."
            ))
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if user.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    resp = {
        "status": status,
        "user": UserOut.model_validate(user).model_dump(),
        "token": create_access_token(user.id),
    }
    # Мобильный вход: адрес возврата в приложение по deep-link. Страница-мост на
    # вебе, получив токен, перебрасывает результат в приложение по этой схеме
    # (VK не принимает кастомные схемы в своём redirect_uri напрямую).
    if (data.platform or "web").lower() == "mobile":
        resp["mobile_redirect"] = settings.vk_login_mobile_redirect_uri or ""
    return resp
