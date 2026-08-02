from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.utils.validation import (
    NameStr, OptNameStr, EmailStr, ShortStr, OptShortStr,
    OptAvatarStr, OptPushTokenStr,
)

# Ограничения длины стоят только на ВХОДЯЩИХ схемах (UserCreate/UserUpdate).
# UserOut описывает ответ и берёт данные из базы — обрезать их не нужно.

class UserCreate(BaseModel):
    name: NameStr
    email: EmailStr
    role: ShortStr = "member"
    title: OptShortStr = None
    telegram: OptShortStr = None
    linkedin: OptShortStr = None
    github: OptShortStr = None

class UserOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    role: str
    title: Optional[str]
    telegram: Optional[str]
    telegram_id: Optional[int] = None
    # Привязан ли Yandex ID — фронт по этому полю может показать статус входа.
    yandex_id: Optional[str] = None
    linkedin: Optional[str]
    github: Optional[str]
    avatar: Optional[str]
    is_blocked: bool = False
    # Статус email/пароля — фронт по ним решает, показывать ли баннер
    # "подтвердите почту" (только если есть email и он не подтверждён),
    # предложение "добавьте email" (если email нет) и пункт "сменить пароль"
    # (только если пароль есть).
    email_confirmed: bool = False
    has_password: bool = False
    detected_region: Optional[str] = None
    preferred_language: Optional[str] = None
    pricing_hint_shown: bool = False
    onboarding_tour_done: bool = False
    onboarding_survey_done: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name: OptNameStr = None
    role: OptShortStr = None
    title: OptShortStr = None
    telegram: OptShortStr = None
    linkedin: OptShortStr = None
    github: OptShortStr = None
    # Аватар приходит как data URI: ограничение не даёт положить в строку
    # базы произвольно большой файл.
    avatar: OptAvatarStr = None
    push_token: OptPushTokenStr = None
    # Язык интерфейса — сохраняется после ручного выбора, чтобы не определять
    # заново при каждом визите (Этап 6).
    preferred_language: OptShortStr = None
    pricing_hint_shown: Optional[bool] = None  # флаг показанной рекомендации тарифа
    onboarding_tour_done: Optional[bool] = None  # флаг прохождения онбординг-гида
    onboarding_survey_done: Optional[bool] = None  # флаг прохождения/пропуска опросника
