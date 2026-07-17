"""Обработка апдейтов Telegram-бота (Этап 3).

Команды бота — тонкие обёртки над УЖЕ существующими сервисами/моделями и тем же
API, что использует веб. Никаких дублирующих бэкенд-эндпоинтов: здесь мы вызываем
существующую логику напрямую (код исполняется на сервере).

Разделение функционала — по таблице: бот отдаёт повестку текстом, быстрый ввод
пункта повестки, ограниченное создание встречи, чек-ин настроения, смену статуса
задач, риск-алерты, Пит-ассистента и поиск по базе знаний.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.meeting import Meeting
from app.models.knowledge import KnowledgeArticle
from app.services import telegram as tg


def _web_url() -> str:
    return (settings.app_web_url or "").rstrip("/")


def _miniapp_button() -> dict:
    """Inline-кнопка открытия Mini App (Этап 6). web_app требует https-URL,
    совпадающий с доменом Web App в BotFather."""
    web = _web_url()
    if not web:
        return None
    return {"inline_keyboard": [[{"text": "Открыть приложение", "web_app": {"url": f"{web}/telegram"}}]]}


def _user_team_ids(db: Session, user: User) -> list[int]:
    lead = [t.id for t in db.query(Team).filter(Team.team_lead_id == user.id).all()]
    member = [m.team_id for m in db.query(TeamMember).filter(TeamMember.user_id == user.id).all()]
    seen, out = set(), []
    for tid in lead + member:
        if tid not in seen:
            seen.add(tid); out.append(tid)
    return out


def _nearest_meeting(db: Session, user: User) -> Meeting | None:
    return (
        db.query(Meeting)
        .filter(
            ((Meeting.member_id == user.id) | (Meeting.team_lead_id == user.id)),
            Meeting.scheduled_date >= datetime.utcnow(),
            Meeting.status != "cancelled",
        )
        .order_by(Meeting.scheduled_date.asc())
        .first()
    )


# ---- команды ---------------------------------------------------------------

def _cmd_start(db, chat_id, tg_data):
    user = tg.find_by_telegram_id(db, tg_data["id"])
    if not user:
        user = tg.create_from_telegram(db, tg_data)
        greeting = f"Добро пожаловать в OneOnOne, {tg_data.get('first_name') or ''}. Аккаунт создан."
    else:
        greeting = f"С возвращением, {user.name}."
    tg.send_message(
        chat_id,
        greeting + "\n\nОткройте приложение кнопкой ниже или используйте команды: "
        "/agenda — повестка, /newmeeting — встреча, /ask — вопрос Питу, "
        "/knowledge — база знаний, /menu — меню.",
        reply_markup=_miniapp_button(),
    )


def _cmd_menu(db, chat_id, user):
    tg.send_message(
        chat_id,
        "Меню OneOnOne. Команды: /agenda, /newmeeting, /ask, /knowledge. "
        "Полная версия — в приложении.",
        reply_markup=_miniapp_button(),
    )


def _cmd_link(db, chat_id, tg_data):
    code = tg.issue_link_code(db, tg_data)
    tg.send_message(
        chat_id,
        "Чтобы связать Telegram с аккаунтом по email, войдите на сайте, откройте меню "
        f"профиля, пункт «Привязать Telegram», и введите код:\n\n{code}\n\nКод действует 30 минут."
    )


def _cmd_agenda(db, chat_id, user, arg: str):
    """Без аргумента — показать повестку ближайшей встречи; с текстом — добавить
    пункт в повестку (быстрый ввод). Переиспользует поле Meeting.agenda."""
    m = _nearest_meeting(db, user)
    if not m:
        tg.send_message(chat_id, "Ближайших встреч нет.")
        return
    when = m.scheduled_date.strftime("%d.%m %H:%M") if m.scheduled_date else ""
    if arg.strip():
        line = arg.strip()
        m.agenda = (m.agenda + "\n" + line) if m.agenda else line
        db.commit()
        tg.send_message(chat_id, f"Добавлено в повестку встречи {when}:\n- {line}")
    else:
        body = m.agenda.strip() if m.agenda else "Повестка пуста. Добавьте пункт: /agenda текст"
        tg.send_message(chat_id, f"Повестка встречи {when}:\n\n{body}")


def _cmd_ask(db, chat_id, user, question: str):
    """Свободный текст/вопрос — передаём существующему Пит-ассистенту."""
    q = question.strip()
    if not q:
        tg.send_message(chat_id, "Напишите вопрос после /ask, например: /ask как подготовиться к 1-on-1.")
        return
    try:
        from app.routers.assistant import pit_chat, ChatRequest, ChatMessage
        result = pit_chat(ChatRequest(messages=[ChatMessage(role="user", content=q)]))
        tg.send_message(chat_id, result.get("reply") or "Пит не смог ответить, попробуйте позже.")
    except Exception:
        tg.send_message(chat_id, "Пит временно недоступен, попробуйте позже.")


def _cmd_knowledge(db, chat_id, user, query: str):
    """Поиск по существующей базе знаний команды пользователя."""
    q = query.strip().lower()
    if not q:
        tg.send_message(chat_id, "Укажите запрос: /knowledge онбординг.")
        return
    team_ids = _user_team_ids(db, user)
    rows = (
        db.query(KnowledgeArticle)
        .filter(KnowledgeArticle.team_id.in_(team_ids) if team_ids else False)
        .all()
    )
    hits = [a for a in rows if q in (a.title or "").lower() or q in (a.content or "").lower()]
    # Общие (админские) статьи тоже ищем — team_id может быть null.
    admin_rows = db.query(KnowledgeArticle).filter(KnowledgeArticle.team_id.is_(None)).all()
    hits += [a for a in admin_rows if q in (a.title or "").lower() or q in (a.content or "").lower()]
    if not hits:
        tg.send_message(chat_id, "По запросу ничего не найдено.")
        return
    top = hits[0]
    text = f"{top.title}\n\n{(top.content or '')[:1500]}"
    if len(hits) > 1:
        text += "\n\nЕщё найдено: " + "; ".join(a.title for a in hits[1:4])
    tg.send_message(chat_id, text)


# ---- точка входа -----------------------------------------------------------

def handle_update(db: Session, update: dict) -> None:
    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    frm = message.get("from") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not frm or not chat_id:
        return

    tg_data = {
        "id": frm.get("id"), "first_name": frm.get("first_name"),
        "username": frm.get("username"), "photo_url": None,
    }

    # /start и /link не требуют существующего аккаунта.
    if text.startswith("/start"):
        _cmd_start(db, chat_id, tg_data); return
    if text.startswith("/link"):
        _cmd_link(db, chat_id, tg_data); return

    user = tg.find_by_telegram_id(db, tg_data["id"])
    if not user:
        tg.send_message(chat_id, "Сначала отправьте /start, чтобы войти.")
        return

    def arg_after(cmd: str) -> str:
        return text[len(cmd):].strip()

    if text.startswith("/menu"):
        _cmd_menu(db, chat_id, user)
    elif text.startswith("/agenda"):
        _cmd_agenda(db, chat_id, user, arg_after("/agenda"))
    elif text.startswith("/knowledge"):
        _cmd_knowledge(db, chat_id, user, arg_after("/knowledge"))
    elif text.startswith("/ask"):
        _cmd_ask(db, chat_id, user, arg_after("/ask"))
    elif text.startswith("/newmeeting"):
        # Пошаговый диалог создания встречи — следующая часть.
        tg.send_message(chat_id, "Создание встречи скоро будет доступно в боте. Пока используйте приложение: /menu")
    elif text.startswith("/"):
        tg.send_message(chat_id, "Команды: /agenda, /newmeeting, /ask, /knowledge, /menu.")
    else:
        # Свободный текст — вопрос Питу (по таблице).
        _cmd_ask(db, chat_id, user, text)
