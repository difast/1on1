"""Отправка писем через SMTP (Reg.ru).

Реквизиты — только из окружения (SMTP_HOST/PORT/USER/PASSWORD/ENCRYPTION).
Письма текстовые, на русском, без эмодзи. Отправка синхронная, но обёрнута
в try/except: сбой почты не должен ронять регистрацию или смену пароля —
пользователь всегда может запросить письмо повторно.
"""
import ssl
import smtplib
import logging
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


def _send(to_email: str, subject: str, body: str) -> bool:
    host = settings.smtp_host
    sender = settings.smtp_sender
    if not host or not sender:
        logger.warning("SMTP не настроен — письмо %s не отправлено", subject)
        return False

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = formataddr(("OneOnOne", sender))
    msg["To"] = to_email

    try:
        if (settings.smtp_encryption or "SSL").upper() == "SSL":
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, settings.smtp_port, context=ctx, timeout=10) as srv:
                if settings.smtp_user:
                    srv.login(settings.smtp_user, settings.smtp_password)
                srv.sendmail(sender, [to_email], msg.as_string())
        else:  # STARTTLS
            with smtplib.SMTP(host, settings.smtp_port, timeout=10) as srv:
                srv.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    srv.login(settings.smtp_user, settings.smtp_password)
                srv.sendmail(sender, [to_email], msg.as_string())
        logger.info("Письмо отправлено: %s -> %s", subject, to_email)
        return True
    except Exception as e:
        logger.error("Ошибка отправки письма '%s' на %s: %s", subject, to_email, e)
        return False


def _web_base() -> str:
    return (settings.app_web_url or "").rstrip("/")


def send_confirmation_email(to_email: str, name: str, token: str) -> bool:
    link = f"{_web_base()}/confirm-email?token={token}"
    body = (
        f"Здравствуйте, {name}.\n\n"
        "Вы указали этот адрес при регистрации в OneOnOne. "
        "Чтобы подтвердить почту, откройте ссылку:\n\n"
        f"{link}\n\n"
        "Ссылка действует 24 часа. Продуктом можно пользоваться и без "
        "подтверждения — оно нужно только для оформления платной подписки.\n\n"
        "Если вы не регистрировались, просто проигнорируйте это письмо."
    )
    return _send(to_email, "Подтверждение почты в OneOnOne", body)


def send_reset_email(to_email: str, name: str, token: str) -> bool:
    link = f"{_web_base()}/reset-password?token={token}"
    body = (
        f"Здравствуйте, {name}.\n\n"
        "Мы получили запрос на смену пароля в OneOnOne. "
        "Чтобы задать новый пароль, откройте ссылку:\n\n"
        f"{link}\n\n"
        "Ссылка действует 1 час. Если вы не запрашивали смену пароля, "
        "просто проигнорируйте это письмо — пароль останется прежним."
    )
    return _send(to_email, "Смена пароля в OneOnOne", body)
