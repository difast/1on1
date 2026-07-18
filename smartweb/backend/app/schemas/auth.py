from pydantic import BaseModel
from typing import Optional
from app.schemas.user import UserOut

# email как обычная строка: формат проверяется в роутере регулярным выражением
# (без зависимости email-validator, чтобы не расширять requirements).


class RegisterReq(BaseModel):
    name: str
    email: str
    password: str
    # Роль по умолчанию пустая — выбирается в онбординге (тимлид/участник).
    role: str = ""
    title: Optional[str] = None


class LoginReq(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


class ConfirmReq(BaseModel):
    token: str


class ResendReq(BaseModel):
    # достаточно одного из полей
    user_id: Optional[int] = None
    email: Optional[str] = None


class ForgotReq(BaseModel):
    email: str


class ResetReq(BaseModel):
    token: str
    new_password: str


class ChangePasswordReq(BaseModel):
    user_id: int
    current_password: str
    new_password: str


class AddEmailReq(BaseModel):
    user_id: int
    email: str
