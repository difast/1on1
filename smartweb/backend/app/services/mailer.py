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
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


def _try_send(to_email: str, subject: str, body: str, html: str | None = None) -> str | None:
    """Отправить письмо. Возвращает None при успехе или строку с ошибкой —
    чтобы диагностический эндпоинт мог показать реальную причину сбоя SMTP.
    Если передан html — письмо уходит multipart/alternative (текст + HTML),
    почтовый клиент показывает HTML, но текстовая версия остаётся запасной."""
    host = settings.smtp_host
    sender = settings.smtp_sender
    if not host or not sender:
        return "SMTP не настроен (нет SMTP_HOST/SMTP_USER в окружении)"

    if html:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(body, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
    else:
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
        return None
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        logger.error("Ошибка отправки письма '%s' на %s: %s", subject, to_email, err)
        return err


def _send(to_email: str, subject: str, body: str) -> bool:
    return _try_send(to_email, subject, body) is None


def send_test(to_email: str) -> dict:
    """Диагностика SMTP (для админ-эндпоинта). Возвращает реальную ошибку."""
    err = _try_send(
        to_email, "OneOnOne — проверка SMTP",
        "Это тестовое письмо для проверки настроек SMTP. Если вы его получили — почта работает.",
    )
    return {
        "ok": err is None,
        "error": err,
        "host": settings.smtp_host or None,
        "port": settings.smtp_port,
        "encryption": settings.smtp_encryption,
        "user": settings.smtp_user or None,
        "sender": settings.smtp_sender or None,
        "password_len": len(settings.smtp_password or ""),
    }


def _web_base() -> str:
    return (settings.app_web_url or "").rstrip("/")


def _html_email(intro: str, button_text: str, link: str, note: str) -> str:
    """Простой адаптивный HTML-шаблон с кнопкой (инлайн-стили, без эмодзи)."""
    return (
        "<!doctype html><html lang='ru'><body style='margin:0;padding:0;"
        "background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;'>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f4f5f7;padding:24px 0;'>"
        "<tr><td align='center'>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
        "style='max-width:460px;background:#ffffff;border-radius:12px;padding:32px;'>"
        "<tr><td style='font-size:20px;font-weight:700;color:#13389E;padding-bottom:20px;'>OneOnOne</td></tr>"
        "<tr><td style='font-size:16px;color:#1a1a2e;padding-bottom:4px;'>Здравствуйте!</td></tr>"
        f"<tr><td style='font-size:15px;color:#3a3a4a;line-height:1.5;padding:8px 0 24px;'>{intro}</td></tr>"
        "<tr><td style='padding-bottom:24px;'>"
        f"<a href='{link}' style='display:inline-block;background:#2554D4;color:#ffffff;"
        "text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:10px;'>"
        f"{button_text}</a></td></tr>"
        f"<tr><td style='font-size:13px;color:#8a8a99;line-height:1.5;'>{note}</td></tr>"
        f"<tr><td style='font-size:12px;color:#b0b0bb;padding-top:16px;word-break:break-all;'>"
        f"Если кнопка не работает, откройте ссылку: {link}</td></tr>"
        "</table></td></tr></table></body></html>"
    )


def send_confirmation_email(to_email: str, name: str, token: str) -> bool:
    link = f"{_web_base()}/confirm-email?token={token}"
    body = (
        "Здравствуйте!\n\n"
        "Чтобы завершить регистрацию в OneOnOne, подтвердите свою почту — "
        "нажмите на кнопку ниже.\n\n"
        f"Подтвердить почту: {link}\n\n"
        "Ссылка действительна 24 часа. Если вы не регистрировались в OneOnOne, "
        "просто проигнорируйте это письмо."
    )
    html = _html_email(
        "Чтобы завершить регистрацию в OneOnOne, подтвердите свою почту — нажмите на кнопку ниже.",
        "Подтвердить почту", link,
        "Ссылка действительна 24 часа. Если вы не регистрировались в OneOnOne, просто проигнорируйте это письмо.",
    )
    return _try_send(to_email, "Подтвердите почту для OneOnOne", body, html) is None


def send_reset_email(to_email: str, name: str, token: str) -> bool:
    link = f"{_web_base()}/reset-password?token={token}"
    body = (
        "Здравствуйте!\n\n"
        "Мы получили запрос на сброс пароля для вашего аккаунта в OneOnOne. "
        "Чтобы задать новый пароль, нажмите на кнопку ниже.\n\n"
        f"Сбросить пароль: {link}\n\n"
        "Ссылка действительна 3 часа. Если вы запрашивали сброс несколько раз, "
        "работает только ссылка из самого последнего письма. Если вы не "
        "запрашивали сброс пароля, просто проигнорируйте это письмо — ваш "
        "текущий пароль останется без изменений."
    )
    html = _html_email(
        "Мы получили запрос на сброс пароля для вашего аккаунта в OneOnOne. Чтобы задать новый пароль, нажмите на кнопку ниже.",
        "Сбросить пароль", link,
        "Ссылка действительна 3 часа. Если вы запрашивали сброс несколько раз, работает только ссылка из самого последнего письма. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — ваш текущий пароль останется без изменений.",
    )
    return _try_send(to_email, "Восстановление пароля OneOnOne", body, html) is None
