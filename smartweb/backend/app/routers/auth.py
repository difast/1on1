"""Собственная аутентификация: регистрация, вход, подтверждение email,
смена и сброс пароля. Supabase больше не используется.

Пароли — только bcrypt-хэш. JWT подписывается ключом из окружения.
Письма (подтверждение/сброс) уходят через SMTP; сбой почты не ломает
основную операцию — письмо можно запросить повторно.
"""
import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.auth_token import AuthToken
from app.schemas.auth import (
    RegisterReq, LoginReq, TokenOut, ConfirmReq, ResendReq,
    ForgotReq, ResetReq, ChangePasswordReq, AddEmailReq,
)
from app.schemas.user import UserOut
from app.utils.passwords import hash_password, verify_password
from app.utils.auth import create_access_token, get_current_user, require_admin
from app.services import mailer

router = APIRouter()

CONFIRM_TTL = timedelta(hours=24)
RESET_TTL = timedelta(hours=1)


# ── валидация ────────────────────────────────────────────────────────────────

def _validate_password(pw: str) -> None:
    if len(pw or "") < 8:
        raise HTTPException(422, "Пароль должен быть не короче 8 символов")
    if not re.search(r"[A-Za-zА-Яа-я]", pw) or not re.search(r"\d", pw):
        raise HTTPException(422, "Пароль должен содержать буквы и цифры")


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


def _validate_email(email: str) -> str:
    e = _norm_email(email)
    if not _EMAIL_RE.match(e):
        raise HTTPException(422, "Некорректный email")
    return e


# ── токены подтверждения/сброса ──────────────────────────────────────────────

def _issue_token(db: Session, user_id: int, purpose: str, ttl: timedelta) -> str:
    # погасим прежние неиспользованные токены того же назначения
    db.query(AuthToken).filter(
        AuthToken.user_id == user_id,
        AuthToken.purpose == purpose,
        AuthToken.used_at.is_(None),
    ).update({AuthToken.used_at: datetime.utcnow()}, synchronize_session=False)
    tok = secrets.token_urlsafe(32)
    db.add(AuthToken(
        user_id=user_id, token=tok, purpose=purpose,
        expires_at=datetime.utcnow() + ttl,
    ))
    db.commit()
    return tok


def _consume_token(db: Session, token: str, purpose: str) -> AuthToken | None:
    row = db.query(AuthToken).filter(
        AuthToken.token == token, AuthToken.purpose == purpose,
    ).first()
    if row is None or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    row.used_at = datetime.utcnow()
    db.commit()
    return row


def _send_confirmation(bg: BackgroundTasks, db: Session, user: User) -> None:
    """Выдать токен подтверждения (быстро, в запросе) и запланировать отправку
    письма в фоне — SMTP не должен блокировать/ронять ответ."""
    if not user.email:
        return
    tok = _issue_token(db, user.id, "confirm", CONFIRM_TTL)
    bg.add_task(mailer.send_confirmation_email, user.email, user.name or "", tok)


# ── регистрация / вход ───────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
def register(data: RegisterReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = _validate_email(data.email)
    _validate_password(data.password)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Этот email уже зарегистрирован")

    user = User(
        name=data.name.strip() or email,
        email=email,
        role=data.role or "",   # роль выбирается в онбординге
        title=data.title,
        password_hash=hash_password(data.password),
        email_confirmed=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Бесплатный старт (тариф Free) — как и при обычном создании пользователя.
    try:
        from app.services import subscriptions as subs
        subs.start_signup_free(db, "user", user.id)
    except Exception:
        db.rollback()

    _send_confirmation(background_tasks, db, user)
    # Пользователь сразу авторизован — доступ не блокируется до подтверждения.
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}


@router.post("/login", response_model=TokenOut)
def login(data: LoginReq, db: Session = Depends(get_db)):
    email = _norm_email(data.email)
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    if user is None:
        raise HTTPException(401, "Не авторизовано")
    return user


@router.post("/smtp-test")
def smtp_test(email: str = Query(...), _admin=Depends(require_admin)):
    """Диагностика SMTP: пробует отправить тестовое письмо и возвращает
    реальную ошибку (или ok). Пароль не раскрывается — только его длина."""
    return mailer.send_test(email)


# ── подтверждение email ──────────────────────────────────────────────────────

@router.post("/confirm-email", response_model=UserOut)
def confirm_email(data: ConfirmReq, db: Session = Depends(get_db)):
    row = _consume_token(db, data.token, "confirm")
    if row is None:
        raise HTTPException(400, "Ссылка недействительна или устарела")
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    user.email_confirmed = True
    db.commit()
    db.refresh(user)
    return user


@router.get("/confirm-email", response_class=HTMLResponse)
def confirm_email_link(token: str = Query(...), db: Session = Depends(get_db)):
    """Переход по ссылке из письма (GET). Возвращает простую HTML-страницу."""
    row = _consume_token(db, token, "confirm")
    ok = False
    if row is not None:
        user = db.query(User).filter(User.id == row.user_id).first()
        if user is not None:
            user.email_confirmed = True
            db.commit()
            ok = True
    msg = ("Почта подтверждена. Можно вернуться в приложение."
           if ok else "Ссылка недействительна или устарела.")
    html = (
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>Подтверждение почты</title></head>"
        "<body style='font-family:system-ui,Arial,sans-serif;max-width:520px;"
        "margin:64px auto;padding:0 20px;color:#1a1a2e'>"
        f"<h1 style='font-size:20px'>{msg}</h1>"
        "</body></html>"
    )
    return HTMLResponse(content=html, status_code=200 if ok else 400)


@router.post("/resend-confirmation")
def resend_confirmation(data: ResendReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    q = db.query(User)
    if data.user_id is not None:
        user = q.filter(User.id == data.user_id).first()
    elif data.email is not None:
        user = q.filter(User.email == _norm_email(data.email)).first()
    else:
        raise HTTPException(422, "Нужен user_id или email")
    # Не раскрываем существование аккаунта и статус — всегда ok.
    if user is not None and user.email and not user.email_confirmed:
        _send_confirmation(background_tasks, db, user)
    return {"ok": True}


# ── сброс пароля (забыл пароль) ──────────────────────────────────────────────

@router.post("/forgot-password")
def forgot_password(data: ForgotReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == _norm_email(data.email)).first()
    # Не раскрываем, есть ли аккаунт. Письмо уходит только если есть пароль.
    if user is not None and user.email and user.password_hash:
        tok = _issue_token(db, user.id, "reset", RESET_TTL)
        background_tasks.add_task(mailer.send_reset_email, user.email, user.name or "", tok)
    return {"ok": True}


@router.post("/reset-password", response_model=TokenOut)
def reset_password(data: ResetReq, db: Session = Depends(get_db)):
    _validate_password(data.new_password)
    row = _consume_token(db, data.token, "reset")
    if row is None:
        raise HTTPException(400, "Ссылка недействительна или устарела")
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    db.refresh(user)
    # Сразу авторизуем — пользователь уже доказал владение почтой.
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}


# ── смена пароля из профиля ──────────────────────────────────────────────────

@router.post("/change-password")
def change_password(data: ChangePasswordReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == data.user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    if not user.password_hash:
        # Пользователь без пароля (вход только через Telegram).
        raise HTTPException(400, "У аккаунта нет пароля — вход через Telegram")
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль неверен")
    _validate_password(data.new_password)
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


# ── добавление email пользователем без почты (Telegram-only, Этап 6) ─────────

@router.post("/add-email", response_model=UserOut)
def add_email(data: AddEmailReq, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == data.user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    email = _validate_email(data.email)
    other = db.query(User).filter(User.email == email, User.id != user.id).first()
    if other is not None:
        raise HTTPException(400, "Этот email уже используется")
    user.email = email
    user.email_confirmed = False
    db.commit()
    db.refresh(user)
    _send_confirmation(background_tasks, db, user)
    return user
