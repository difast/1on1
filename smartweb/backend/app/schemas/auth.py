from pydantic import BaseModel
from app.schemas.user import UserOut
from app.utils.validation import (
    NameStr, EmailStr, OptEmailStr, PasswordStr, TokenStr, ShortStr, OptShortStr,
    EntityId, OptEntityId,
)

# Формат email и требования к паролю проверяются в роутере (_validate_email,
# _validate_password): там понятные сообщения на языке пользователя. В схеме —
# только верхние границы длины, чтобы гигантское тело запроса отсекалось до
# разбора и до похода в базу.


class RegisterReq(BaseModel):
    name: NameStr
    email: EmailStr
    password: PasswordStr
    # Роль по умолчанию пустая — выбирается в онбординге (тимлид/участник).
    role: ShortStr = ""
    title: OptShortStr = None


class LoginReq(BaseModel):
    email: EmailStr
    password: PasswordStr


class TokenOut(BaseModel):
    token: str
    user: UserOut


class RegisterOut(BaseModel):
    """Ответ регистрации — БЕЗ токена: доступ закрыт до подтверждения почты
    (Задача 2.4). Клиент показывает модальное окно «подтвердите почту» и не
    пускает в кабинет, пока пользователь не подтвердит адрес и не войдёт."""
    user: UserOut
    email_sent: bool = True


class ConfirmReq(BaseModel):
    token: TokenStr


class ResendReq(BaseModel):
    # достаточно одного из полей
    user_id: OptEntityId = None
    email: OptEmailStr = None


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    token: TokenStr
    new_password: PasswordStr


class ChangePasswordReq(BaseModel):
    user_id: EntityId
    current_password: PasswordStr
    new_password: PasswordStr


class AddEmailReq(BaseModel):
    user_id: EntityId
    email: EmailStr
