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
from app.services import i18n

logger = logging.getLogger(__name__)


def configured() -> bool:
    """Настроена ли отправка писем (есть SMTP_HOST и адрес отправителя).

    По этому признаку код по email при входе включается автоматически: если
    почта работает — код можно доставить, значит его можно требовать."""
    return bool(settings.smtp_host and settings.smtp_sender)


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


def _html_email(intro: str, button_text: str, link: str, note: str, lang: str = "ru") -> str:
    """Простой адаптивный HTML-шаблон с кнопкой (инлайн-стили). Тексты письма
    (приветствие, вступление, примечание) — дружелюбные и могут содержать
    немного эмодзи; сюда они приходят готовыми из i18n на языке письма."""
    return (
        f"<!doctype html><html lang='{lang}'><body style='margin:0;padding:0;"
        "background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;'>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f4f5f7;padding:24px 0;'>"
        "<tr><td align='center'>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
        "style='max-width:460px;background:#ffffff;border-radius:12px;padding:32px;'>"
        "<tr><td style='font-size:20px;font-weight:700;color:#13389E;padding-bottom:20px;'>OneOnOne</td></tr>"
        f"<tr><td style='font-size:16px;color:#1a1a2e;padding-bottom:4px;'>{i18n.t('email.greeting', lang)}</td></tr>"
        f"<tr><td style='font-size:15px;color:#3a3a4a;line-height:1.5;padding:8px 0 24px;'>{intro}</td></tr>"
        "<tr><td style='padding-bottom:24px;'>"
        f"<a href='{link}' style='display:inline-block;background:#2554D4;color:#ffffff;"
        "text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:10px;'>"
        f"{button_text}</a></td></tr>"
        f"<tr><td style='font-size:13px;color:#8a8a99;line-height:1.5;'>{note}</td></tr>"
        f"<tr><td style='font-size:12px;color:#b0b0bb;padding-top:16px;word-break:break-all;'>"
        f"{i18n.t('email.fallbackLink', lang, link=link)}</td></tr>"
        "</table></td></tr></table></body></html>"
    )


def send_confirmation_email(to_email: str, name: str, token: str, lang: str | None = None) -> bool:
    """Письмо подтверждения почты на языке пользователя (ru/en/kz)."""
    lang = i18n.normalize_lang(lang)
    link = f"{_web_base()}/confirm-email?token={token}"
    intro = i18n.t("email.confirm.intro", lang)
    button = i18n.t("email.confirm.button", lang)
    note = i18n.t("email.confirm.note", lang)
    body = (
        f"{i18n.t('email.greeting', lang)}\n\n"
        f"{intro}\n\n"
        f"{button}: {link}\n\n"
        f"{note}"
    )
    html = _html_email(intro, button, link, note, lang)
    return _try_send(to_email, i18n.t("email.confirm.subject", lang), body, html) is None


def send_login_code(to_email: str, name: str, code: str,
                    lang: str | None = None) -> bool:
    """Код для завершения входа в OneOnOne. Отправляется при каждом входе по
    email/паролю. Текст нейтральный, не привязан к «новому устройству» — код
    запрашивается всегда, независимо от устройства."""
    subject = "Ваш код для входа в OneOnOne 🔐"
    body = (
        f"Здравствуйте! 👋\n\n"
        f"Ваш код для входа в OneOnOne: {code}\n\n"
        f"Введите его на странице входа, чтобы завершить вход — код действует 15 минут. ⏳\n\n"
        f"Если вход выполняли не вы, просто не вводите код и на всякий случай смените "
        f"пароль в настройках профиля. Мы поможем, если что — команда OneOnOne. 💙"
    )
    return _try_send(to_email, subject, body) is None


# Обратная совместимость: прежнее имя ссылается на нейтральную функцию.
def send_new_device_code(to_email: str, name: str, code: str, device: str = "",
                         lang: str | None = None) -> bool:
    return send_login_code(to_email, name, code, lang)


def send_new_device_notice(to_email: str, name: str, device: str, when: str,
                           lang: str | None = None) -> bool:
    """Уведомление о входе с нового устройства (Блок 1, Этап 4)."""
    subject = "Новый вход в ваш аккаунт OneOnOne 🔔"
    body = (
        f"Здравствуйте! 👋\n\n"
        f"Заметили новый вход в ваш аккаунт OneOnOne и решили вас предупредить.\n\n"
        f"Устройство: {device}\n"
        f"Примерное время: {when}\n\n"
        f"Если это были вы — всё в порядке, ничего делать не нужно. 👍\n"
        f"Если это были не вы — как можно скорее смените пароль в настройках профиля "
        f"и завершите чужие сессии в разделе «Безопасность». Мы рядом и поможем. 💙"
    )
    return _try_send(to_email, subject, body) is None


def send_reset_email(to_email: str, name: str, token: str, lang: str | None = None) -> bool:
    """Письмо сброса пароля на языке пользователя (ru/en/kz)."""
    lang = i18n.normalize_lang(lang)
    link = f"{_web_base()}/reset-password?token={token}"
    intro = i18n.t("email.reset.intro", lang)
    button = i18n.t("email.reset.button", lang)
    note = i18n.t("email.reset.note", lang)
    body = (
        f"{i18n.t('email.greeting', lang)}\n\n"
        f"{intro}\n\n"
        f"{button}: {link}\n\n"
        f"{note}"
    )
    html = _html_email(intro, button, link, note, lang)
    return _try_send(to_email, i18n.t("email.reset.subject", lang), body, html) is None
