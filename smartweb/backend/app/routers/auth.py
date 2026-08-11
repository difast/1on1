"""Собственная аутентификация: регистрация, вход, подтверждение email,
смена и сброс пароля. Supabase больше не используется.

Пароли — только bcrypt-хэш. JWT подписывается ключом из окружения.
Письма (подтверждение/сброс) уходят через SMTP; сбой почты не ломает
основную операцию — письмо можно запросить повторно.
"""
import re
import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.auth_token import AuthToken
from app.schemas.auth import (
    RegisterReq, LoginReq, TokenOut, RegisterOut, ConfirmReq, ResendReq,
    ForgotReq, ResetReq, ChangePasswordReq, AddEmailReq,
)
from app.schemas.user import UserOut
from app.utils.passwords import hash_password, verify_password
from app.utils.auth import create_access_token, create_admin_token, get_current_user, require_admin, require_user
from app.services import mailer, i18n
from app.utils import ratelimit
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

import os
from pydantic import BaseModel


class AdminLoginReq(BaseModel):
    password: str


@router.post("/admin-login")
def admin_login(data: AdminLoginReq, request: Request):
    """Вход в админ-панель по паролю. Возвращает админ-JWT, который клиент кладёт
    в Authorization — тогда запросы проходят гейт AUTH_ENFORCE и require_admin.

    Пароль берётся ТОЛЬКО из окружения (ADMIN_PASSWORD). Значения по умолчанию
    нет: пока переменная не задана, вход в админку недоступен (503 — ошибка
    конфигурации), а не открыт по зашитому в репозиторий паролю."""
    # Подбор пароля админки: пять попыток за пятнадцать минут с одного адреса.
    ratelimit.check_request(ratelimit.ADMIN_LOGIN, request)
    expected = os.getenv("ADMIN_PASSWORD", "")
    if not expected:
        raise HTTPException(status_code=503,
                            detail="Вход в админ-панель не настроен: не задана переменная ADMIN_PASSWORD")
    if not data.password or not secrets.compare_digest(data.password, expected):
        raise HTTPException(status_code=401, detail="Неверный пароль администратора")
    return {"token": create_admin_token()}

CONFIRM_TTL = timedelta(hours=24)
# Сброс пароля: 1 час был слишком жёстким на новой инфраструктуре — при
# малейшей задержке доставки письма или если пользователь открывал ссылку не
# сразу, токен успевал истечь, и корректная ссылка отдавала «недействительна».
# 3 часа: по-прежнему короткоживущий одноразовый токен (гасится при повторном
# запросе), но терпимый к задержкам доставки. Текст письма обновлён синхронно.
RESET_TTL = timedelta(hours=3)


# ── валидация ────────────────────────────────────────────────────────────────

def _validate_password(pw: str) -> None:
    if len(pw or "") < 8:
        raise HTTPException(422, "Пароль должен быть не короче 8 символов")
    if not re.search(r"[A-Za-zА-Яа-я]", pw) or not re.search(r"\d", pw):
        raise HTTPException(422, "Пароль должен содержать буквы и цифры")


def _check_pwned(pw: str) -> None:
    """Проверка пароля по базе утечек (Этап 2). По умолчанию — предупреждение без
    блокировки; при pwned_block=1 — жёсткий отказ. Сетевой сбой HIBP не блокирует.
    """
    try:
        if settings.pwned_block:
            from app.services import pwned
            if pwned.is_pwned(pw):
                raise HTTPException(status_code=422, detail={
                    "code": "pwned_password",
                    "message": "Этот пароль встречается в известных утечках. Выберите другой пароль.",
                })
    except HTTPException:
        raise
    except Exception:
        pass


@router.get("/captcha-config")
def captcha_config():
    """Публичные данные для рендера виджета капчи на фронте (без секретов)."""
    return {
        "client_key": settings.captcha_client_key or "",
        "enabled": bool(settings.captcha_client_key),
        "enforced": bool(settings.captcha_enforce),
    }


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


def _issue_token_value(db: Session, user_id: int, token_value: str, purpose: str, ttl: timedelta) -> None:
    """Выдать токен с ЗАДАННЫМ значением (для числовых кодов, привязанных к
    пользователю/устройству). Прежние неиспользованные того же назначения гасим."""
    db.query(AuthToken).filter(
        AuthToken.user_id == user_id, AuthToken.purpose == purpose,
        AuthToken.used_at.is_(None),
    ).update({AuthToken.used_at: datetime.utcnow()}, synchronize_session=False)
    db.add(AuthToken(user_id=user_id, token=token_value, purpose=purpose,
                     expires_at=datetime.utcnow() + ttl))
    db.commit()


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
    bg.add_task(mailer.send_confirmation_email, user.email, user.name or "", tok,
                user.preferred_language)


# ── регистрация / вход ───────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterOut)
def register(data: RegisterReq, background_tasks: BackgroundTasks, request: Request,
             db: Session = Depends(get_db)):
    # Массовая регистрация с одного адреса: пять аккаунтов в час.
    ratelimit.check_request(ratelimit.REGISTER, request)
    # Капча (на регистрации — самая частая точка атаки ботов; SmartCaptcha
    # адаптивно даёт задание, а не только чекбокс, при подозрительном поведении).
    from app.services import captcha
    captcha.ensure(data.captcha_token, ratelimit.client_ip(request))
    email = _validate_email(data.email)
    _validate_password(data.password)
    _check_pwned(data.password)
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

    # Пробный период тарифа Start (14 дней) — как и при обычном создании пользователя.
    try:
        from app.services import subscriptions as subs
        subs.start_signup_trial(db, "user", user.id)
    except Exception:
        db.rollback()

    _send_confirmation(background_tasks, db, user)
    # Токен НЕ выдаём: доступ в кабинет закрыт до подтверждения почты (2.4).
    # Клиент показывает модальное окно подтверждения; войти можно только после
    # перехода по ссылке из письма (login тогда пропустит).
    return {"user": UserOut.model_validate(user), "email_sent": bool(user.email)}


# Мягкая ошибка блокировки входа: фронт по code='email_unconfirmed' показывает
# понятное сообщение и кнопку повторной отправки письма (2.4), а не текст ошибки.
def _email_unconfirmed_detail(email: str) -> dict:
    return {
        "code": "email_unconfirmed",
        "email": email,
        "message": "Подтвердите почту, чтобы войти. Мы отправили ссылку на "
                   f"{email}. Перейдите по ней, затем войдите снова.",
    }


def _login_code_token(user_id: int, code: str) -> str:
    """Ключ кода подтверждения входа, привязанный к пользователю (код по email
    запрашивается при каждом входе — Задача 7)."""
    return f"lc:{user_id}:{code}"


def _issue_and_grant(db: Session, user: User, request: Request,
                     device_hash: str | None, remember_new: bool = True) -> dict:
    """Финал успешного входа: создать/обновить сессию устройства, запомнить
    устройство, выдать токен. Сессия дедуплицируется по устройству (Задача 4)."""
    from app.services import sessions as sess, audit
    ua = request.headers.get("user-agent")
    ip = ratelimit.client_ip(request)
    jti = sess.new_jti()
    # Одна активная сессия на устройство: если для этого устройства уже есть
    # сессия — обновляем её (новый jti, время), а не плодим дубли.
    sess.create_session(db, user.id, jti, user_agent=ua, ip=ip, device_hash=device_hash)
    if remember_new and device_hash:
        sess.remember_device(db, user.id, device_hash, user_agent=ua, ip=ip, trusted=True)
    audit.record(db, "auth.login_success", actor_id=user.id, entity_type="user",
                 entity_id=user.id, organization_id=audit.org_of_user(db, user.id),
                 category="auth", ip=ip, summary=f"Успешный вход: {user.email}")
    return {"token": create_access_token(user.id, jti=jti), "user": UserOut.model_validate(user)}


def _verify_totp(db: Session, user: User, code: str | None) -> bool:
    """Проверить TOTP-код или одноразовый резервный код."""
    if not code:
        return False
    code = code.strip().replace(" ", "")
    from app.services import crypto
    secret = crypto.decrypt(user.totp_secret_enc)
    if secret:
        import pyotp
        if pyotp.TOTP(secret).verify(code, valid_window=1):
            return True
    # Резервный код (одноразовый).
    from app.models.auth_security import TotpBackupCode
    for bc in db.query(TotpBackupCode).filter(
            TotpBackupCode.user_id == user.id, TotpBackupCode.used_at.is_(None)).all():
        if verify_password(code, bc.code_hash):
            bc.used_at = datetime.utcnow()
            db.commit()
            return True
    return False


@router.post("/login")
def login(data: LoginReq, background_tasks: BackgroundTasks, request: Request,
          db: Session = Depends(get_db)):
    from app.services import captcha, sessions as sess, audit
    email = _norm_email(data.email)
    ip = ratelimit.client_ip(request)
    # Лимиты: по IP, по аккаунту и по комбинации IP+email (Блок 1) — слой поверх
    # капчи, не вместо неё.
    ratelimit.check_request(ratelimit.LOGIN_IP, request)
    ratelimit.check(ratelimit.LOGIN_ACCOUNT, email)
    ratelimit.check(ratelimit.LOGIN_COMBO, f"{ip}|{email}")
    # Капча — только на ПЕРВОМ шаге входа (ввод email/пароля). Продолжения того же
    # входа (шаг TOTP и шаг ввода кода из письма) капчу не требуют: пользователь
    # уже прошёл её при нажатии «Войти», а на этих шагах вводится код. От перебора
    # паролей эти шаги защищены отдельно — они возможны только после верного
    # пароля, плюс действуют лимиты частоты по IP/аккаунту выше.
    first_step = not data.totp_code and not data.device_code
    if first_step:
        captcha.ensure(data.captcha_token, ip)

    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        audit.record(db, "auth.login_failed", actor_id=(user.id if user else None),
                     entity_type="user", entity_id=(user.id if user else None),
                     category="auth", ip=ip, summary=f"Неуспешный вход: {email}")
        raise HTTPException(401, "Неверный email или пароль")
    ratelimit.reset(ratelimit.LOGIN_ACCOUNT, email)
    ratelimit.reset(ratelimit.LOGIN_COMBO, f"{ip}|{email}")
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    if user.email and not user.email_confirmed:
        _send_confirmation(background_tasks, db, user)
        raise HTTPException(status_code=403, detail=_email_unconfirmed_detail(user.email))

    # Прозрачная миграция bcrypt на актуальную стоимость (Этап 1): если хэш
    # выдан со старым cost-фактором, перехэшируем при верном пароле, без сброса.
    try:
        from app.utils.passwords import needs_rehash
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(data.password)
            db.commit()
    except Exception:
        db.rollback()

    # 2FA (TOTP): после верного пароля, до кода по email и до выдачи доступа.
    # На шаге ввода кода из письма (device_code присутствует) TOTP повторно НЕ
    # проверяем: код письма выпускается только ПОСЛЕ успешного TOTP, поэтому его
    # наличие уже подтверждает второй фактор. Иначе одноразовый резервный код
    # «сгорал» бы на первом шаге и не проходил на шаге ввода кода из письма.
    if user.totp_enabled and not data.device_code:
        if not data.totp_code:
            return {"status": "totp_required"}
        if not _verify_totp(db, user, data.totp_code):
            audit.record(db, "auth.totp_failed", actor_id=user.id, entity_type="user",
                         entity_id=user.id, category="auth", ip=ip, summary="Неверный код 2FA")
            raise HTTPException(status_code=401, detail="Неверный код подтверждения")

    # Определяем устройство: для уведомления о новом входе и для дедупликации
    # сессий (одна активная сессия на устройство).
    device_raw = request.headers.get("x-device-id") or data.device_id
    device_hash = sess.hash_device(device_raw)
    is_known = sess.known_device(db, user.id, device_hash) is not None
    ua = request.headers.get("user-agent")
    label = sess.device_label(ua)
    new_device = (not is_known) and bool(device_hash)

    def _notify_new_device():
        """Отдельное уведомление-предупреждение о входе с нового устройства.
        Работает ПАРАЛЛЕЛЬНО с кодом подтверждения, не заменяется им."""
        if new_device and user.email:
            when = datetime.utcnow().strftime("%d.%m.%Y %H:%M UTC")
            background_tasks.add_task(mailer.send_new_device_notice, user.email,
                                      user.name or "", label, when, user.preferred_language)
            audit.record(db, "auth.new_device_login", actor_id=user.id, entity_type="user",
                         entity_id=user.id, category="security", ip=ip,
                         summary=f"Вход с нового устройства: {label}")

    # Код по email при КАЖДОМ входе (Задача 7): после верного пароля (и TOTP)
    # всегда требуется код из письма, независимо от устройства. Активен, если
    # включён явным флагом ИЛИ если настроена доставка почты (иначе код нельзя
    # доставить и требовать его нельзя — иначе вход заблокируется). Так поведение
    # работает в проде «из коробки», без ручной установки переменной окружения.
    login_code_active = (settings.login_email_code or mailer.configured())
    if login_code_active and user.email:
        if data.device_code:
            tok = _consume_token(db, _login_code_token(user.id, data.device_code.strip()), "login_code")
            if not tok:
                raise HTTPException(status_code=401, detail="Неверный или просроченный код подтверждения")
            # Код верен -> завершаем вход (уведомление о новом устройстве уже
            # отправлено на первом шаге).
            return _issue_and_grant(db, user, request, device_hash, remember_new=True)
        # Первый шаг: высылаем код входа и, если устройство новое, ОТДЕЛЬНОЕ
        # уведомление-предупреждение (параллельно коду).
        code = f"{secrets.randbelow(1000000):06d}"
        _issue_token_value(db, user.id, _login_code_token(user.id, code), "login_code", timedelta(minutes=15))
        background_tasks.add_task(mailer.send_login_code, user.email, user.name or "", code, user.preferred_language)
        _notify_new_device()
        audit.record(db, "auth.login_code_sent", actor_id=user.id, entity_type="user",
                     entity_id=user.id, category="auth", ip=ip,
                     summary="Отправлен код подтверждения входа")
        return {"status": "email_code_required", "email": _mask_email(user.email)}

    # Код по email выключен: новое устройство -> только уведомление (не блокирует).
    _notify_new_device()
    return _issue_and_grant(db, user, request, device_hash, remember_new=True)


def _mask_email(email: str | None) -> str:
    if not email or "@" not in email:
        return ""
    name, dom = email.split("@", 1)
    head = name[0] if name else ""
    return f"{head}***@{dom}"


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    if user is None:
        raise HTTPException(401, "Не авторизовано")
    return user


@router.get("/smtp-test")
@router.post("/smtp-test")
def smtp_test(email: str = Query(...), _admin=Depends(require_admin)):
    """Диагностика SMTP: пробует отправить тестовое письмо и возвращает
    реальную ошибку (или ok). Пароль не раскрывается — только его длина.
    Доступен по GET и POST, чтобы можно было просто открыть ссылку в браузере."""
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
    lang = i18n.DEFAULT_LANG
    if row is not None:
        user = db.query(User).filter(User.id == row.user_id).first()
        if user is not None:
            # Страница открывается по ссылке из письма — язык берём из профиля,
            # как и само письмо, чтобы человек не увидел два разных языка подряд.
            lang = i18n.user_lang(user)
            user.email_confirmed = True
            db.commit()
            ok = True
    msg = i18n.t("email.confirm.page.ok" if ok else "email.confirm.page.fail", lang)
    html = (
        f"<!doctype html><html lang='{lang}'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{i18n.t('email.confirm.page.title', lang)}</title></head>"
        "<body style='font-family:system-ui,Arial,sans-serif;max-width:520px;"
        "margin:64px auto;padding:0 20px;color:#1a1a2e'>"
        f"<h1 style='font-size:20px'>{msg}</h1>"
        "</body></html>"
    )
    return HTMLResponse(content=html, status_code=200 if ok else 400)


@router.post("/resend-confirmation")
def resend_confirmation(data: ResendReq, background_tasks: BackgroundTasks, request: Request,
                        db: Session = Depends(get_db)):
    # Защита от рассылки писем на чужой адрес: лимит и по отправителю (IP), и
    # по адресу получателя.
    ratelimit.check_request(ratelimit.EMAIL_IP, request)
    if data.email:
        ratelimit.check(ratelimit.EMAIL_TARGET, _norm_email(data.email))
    elif data.user_id is not None:
        ratelimit.check(ratelimit.EMAIL_TARGET, f"uid:{data.user_id}")
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
def forgot_password(data: ForgotReq, background_tasks: BackgroundTasks, request: Request,
                    db: Session = Depends(get_db)):
    email = _norm_email(data.email)
    # То же, что и у повторной отправки подтверждения: без лимита форма
    # «забыл пароль» превращается в средство спама на любой адрес.
    ratelimit.check_request(ratelimit.EMAIL_IP, request)
    ratelimit.check(ratelimit.EMAIL_TARGET, email)
    # Капча на форме сброса: защита от автоматизированного спама письмами.
    from app.services import captcha
    captcha.ensure(data.captcha_token, ratelimit.client_ip(request))
    user = db.query(User).filter(User.email == email).first()
    # Не раскрываем, есть ли аккаунт. Письмо уходит только если есть пароль.
    # Логируем причину (без утечки наружу — ответ всегда {ok: true}), чтобы в
    # логах Timeweb было видно, ушло письмо или нет и почему.
    if user is None:
        logger.info("forgot-password: аккаунт не найден (%s) — письмо не отправляется", email)
    elif not user.password_hash:
        logger.info("forgot-password: у аккаунта нет пароля (%s, вход через Telegram) — письмо не отправляется", email)
    elif not user.email:
        logger.info("forgot-password: у аккаунта нет email (id=%s) — письмо не отправляется", user.id)
    else:
        tok = _issue_token(db, user.id, "reset", RESET_TTL)
        background_tasks.add_task(mailer.send_reset_email, user.email, user.name or "", tok,
                                  user.preferred_language)
        logger.info("forgot-password: письмо сброса поставлено в очередь (%s)", email)
    return {"ok": True}


@router.post("/reset-password", response_model=TokenOut)
def reset_password(data: ResetReq, request: Request, db: Session = Depends(get_db)):
    # Перебор токена сброса.
    ratelimit.check_request(ratelimit.LOGIN_IP, request)
    _validate_password(data.new_password)
    row = _consume_token(db, data.token, "reset")
    if row is None:
        # Разбираем, ПОЧЕМУ токен не принят (истёк / уже использован / нет
        # такого) — иначе в проде «Ссылка недействительна» не диагностируется.
        probe = db.query(AuthToken).filter(
            AuthToken.token == data.token, AuthToken.purpose == "reset",
        ).first()
        if probe is None:
            reason = "нет такого токена (устарел после нового запроса сброса или неверная ссылка)"
        elif probe.used_at is not None:
            reason = "токен уже использован"
        else:
            reason = "срок действия истёк"
        logger.info("reset-password: отклонён — %s", reason)
        raise HTTPException(400, "Ссылка недействительна или устарела")
    _check_pwned(data.new_password)
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    logger.info("reset-password: пароль успешно изменён (user id=%s)", user.id)
    user.password_hash = hash_password(data.new_password)
    db.commit()
    db.refresh(user)
    # Сброс пароля завершает ВСЕ прежние сессии (Этап 6): если пароль
    # компрометирован, старые токены больше не действуют. Выдаём новую сессию.
    from app.services import sessions as sess, audit
    sess.revoke_others(db, user.id, keep_jti=None)
    audit.record(db, "auth.password_reset", actor_id=user.id, entity_type="user",
                 entity_id=user.id, category="security", ip=ratelimit.client_ip(request),
                 summary="Пароль сброшен; все прежние сессии завершены")
    # Сразу авторизуем — пользователь уже доказал владение почтой.
    return _issue_and_grant(db, user, request, sess.hash_device(request.headers.get("x-device-id")), remember_new=True)


# ── смена пароля из профиля ──────────────────────────────────────────────────

@router.post("/change-password")
def change_password(data: ChangePasswordReq, request: Request,
                    db: Session = Depends(get_db), current=Depends(require_user)):
    # Менять пароль можно только СВОЙ (личность из токена, не из тела запроса).
    if current.id != data.user_id:
        raise HTTPException(status_code=403, detail="Можно менять только свой пароль")
    user = current
    if not user.password_hash:
        # Пользователь без пароля (вход только через Telegram).
        raise HTTPException(400, "У аккаунта нет пароля — вход через Telegram")
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль неверен")
    _validate_password(data.new_password)
    _check_pwned(data.new_password)
    user.password_hash = hash_password(data.new_password)
    db.commit()
    # Смена пароля завершает все сессии, КРОМЕ текущей (Этап 6).
    from app.services import sessions as sess, audit
    claims = _decode_jti(request)
    revoked = sess.revoke_others(db, user.id, keep_jti=claims)
    audit.record(db, "auth.password_changed", actor_id=user.id, entity_type="user",
                 entity_id=user.id, category="security", ip=ratelimit.client_ip(request),
                 summary=f"Пароль изменён; завершено прочих сессий: {revoked}")
    return {"ok": True, "sessions_revoked": revoked}


def _decode_jti(request: Request) -> str | None:
    """jti текущей сессии из заголовка Authorization (для «завершить все, кроме
    текущей»)."""
    from app.utils.auth import _token_from_header, _decode
    tok = _token_from_header(request.headers.get("authorization"))
    claims = _decode(tok) if tok else None
    return claims.get("jti") if claims else None


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


# ── 2FA (TOTP) — опционально, включается пользователем (Этап 3) ───────────────

class TotpEnableReq(BaseModel):
    code: str


class TotpDisableReq(BaseModel):
    password: str


def _gen_backup_codes(n: int = 10) -> list[str]:
    """Читаемые одноразовые коды вида XXXX-XXXX (без похожих символов)."""
    import secrets as _s
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    codes = []
    for _ in range(n):
        raw = "".join(_s.choice(alpha) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


@router.get("/2fa/status")
def totp_status(current=Depends(require_user), db: Session = Depends(get_db)):
    from app.models.auth_security import TotpBackupCode
    unused = db.query(TotpBackupCode).filter(
        TotpBackupCode.user_id == current.id, TotpBackupCode.used_at.is_(None)).count()
    return {"enabled": bool(current.totp_enabled), "backup_codes_left": unused}


@router.post("/2fa/setup")
def totp_setup(current=Depends(require_user), db: Session = Depends(get_db)):
    """Сгенерировать секрет и вернуть otpauth-URI для QR. 2FA пока НЕ включается —
    только после подтверждения кодом в /2fa/enable."""
    if current.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    import pyotp
    from app.services import crypto
    secret = pyotp.random_base32()
    current.totp_secret_enc = crypto.encrypt(secret)
    db.commit()
    label = current.email or f"user{current.id}"
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name="OneOnOne")
    # secret отдаём для ручного ввода, uri — для QR (QR рисует клиент).
    return {"otpauth_uri": uri, "secret": secret}


@router.post("/2fa/enable")
def totp_enable(data: TotpEnableReq, current=Depends(require_user), db: Session = Depends(get_db)):
    if current.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    from app.services import crypto, audit
    from app.models.auth_security import TotpBackupCode
    secret = crypto.decrypt(current.totp_secret_enc)
    if not secret:
        raise HTTPException(400, "Сначала выполните настройку 2FA")
    import pyotp
    if not pyotp.TOTP(secret).verify((data.code or "").strip(), valid_window=1):
        raise HTTPException(400, "Неверный код. Проверьте время на устройстве")
    current.totp_enabled = True
    # Резервные коды: генерируем, храним хэши, показываем один раз.
    db.query(TotpBackupCode).filter(TotpBackupCode.user_id == current.id).delete()
    codes = _gen_backup_codes(10)
    for c in codes:
        db.add(TotpBackupCode(user_id=current.id, code_hash=hash_password(c)))
    db.commit()
    audit.record(db, "auth.2fa_enabled", actor_id=current.id, entity_type="user",
                 entity_id=current.id, category="security", summary="Включена 2FA (TOTP)")
    return {"enabled": True, "backup_codes": codes}


@router.post("/2fa/disable")
def totp_disable(data: TotpDisableReq, current=Depends(require_user), db: Session = Depends(get_db)):
    """Отключение 2FA — с подтверждением паролем."""
    if not current.password_hash or not verify_password(data.password, current.password_hash):
        raise HTTPException(400, "Неверный пароль")
    from app.services import audit
    from app.models.auth_security import TotpBackupCode
    current.totp_enabled = False
    current.totp_secret_enc = None
    db.query(TotpBackupCode).filter(TotpBackupCode.user_id == current.id).delete()
    db.commit()
    audit.record(db, "auth.2fa_disabled", actor_id=current.id, entity_type="user",
                 entity_id=current.id, category="security", summary="Отключена 2FA")
    return {"enabled": False}


# ── управление сессиями (Этап 6) ──────────────────────────────────────────────

@router.get("/sessions")
def list_sessions(request: Request, current=Depends(require_user), db: Session = Depends(get_db)):
    from app.services import sessions as sess
    cur_jti = _decode_jti(request)
    out = []
    for s in sess.list_active(db, current.id):
        out.append({
            "id": s.id,
            "device": s.device_label,
            "ip": s.ip,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_active_at": s.last_active_at.isoformat() if s.last_active_at else None,
            "current": bool(cur_jti and s.jti == cur_jti),
        })
    return {"sessions": out}


@router.delete("/sessions/{session_id}")
def revoke_one_session(session_id: int, current=Depends(require_user), db: Session = Depends(get_db)):
    from app.services import sessions as sess, audit
    ok = sess.revoke_session(db, current.id, session_id)
    if not ok:
        raise HTTPException(404, "Сессия не найдена")
    audit.record(db, "auth.session_revoked", actor_id=current.id, entity_type="user_session",
                 entity_id=session_id, category="security", summary="Завершена сессия")
    return {"ok": True}


@router.post("/sessions/revoke-others")
def revoke_other_sessions(request: Request, current=Depends(require_user), db: Session = Depends(get_db)):
    from app.services import sessions as sess, audit
    cur_jti = _decode_jti(request)
    n = sess.revoke_others(db, current.id, keep_jti=cur_jti)
    audit.record(db, "auth.sessions_revoked_others", actor_id=current.id, entity_type="user",
                 entity_id=current.id, category="security", summary=f"Завершено чужих сессий: {n}")
    return {"ok": True, "revoked": n}
