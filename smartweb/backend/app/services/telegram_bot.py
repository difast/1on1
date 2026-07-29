"""Обработка апдейтов Telegram-бота (Этап 3).

Команды и inline-кнопки — тонкие обёртки над УЖЕ существующими сервисами,
эндпоинтами и моделями (тот же код, что использует веб). Никаких дублирующих
бэкенд-эндпоинтов: логика вызывается напрямую (исполняется на сервере).

Функции по таблице разделения: повестка текстом + быстрый ввод, ограниченное
создание встречи (участник + дата/время, без повторяемости/шаблонов), чек-ин
настроения кнопками, смена статуса задач кнопками, риск-действия, Пит и база знаний.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.knowledge import KnowledgeArticle
from app.models.telegram import TelegramBotState
from app.services import telegram as tg
from app.services import i18n

def status_labels(lang: str | None = None) -> dict:
    """Подписи статусов задачи на языке пользователя. Функция, а не константа:
    язык известен только в момент ответа конкретному человеку."""
    return {
        "in_progress": i18n.t('bot.status.inProgress', lang),
        "review": i18n.t('bot.status.review', lang),
        "blocked": i18n.t('bot.status.blocked', lang),
        "done": i18n.t('bot.status.done', lang),
    }
def status_btn(lang: str | None = None) -> dict:
    """Подписи на кнопках смены статуса: основное действие сформулировано явно.
    Как и подписи статусов, зависят от языка пользователя."""
    return {
        "in_progress": i18n.t('bot.action.backToWork', lang),
        "review": i18n.t('bot.status.review', lang),
        "blocked": i18n.t('bot.action.markBlocked', lang),
        "done": i18n.t('bot.action.markDone', lang),
    }


def _web_url() -> str:
    return (settings.app_web_url or "").rstrip("/")


def _miniapp_button(lang: str | None = None) -> dict | None:
    web = _web_url()
    if not web:
        return None
    return {"inline_keyboard": [[{"text": i18n.t('bot.action.openApp', lang), "web_app": {"url": f"{web}/telegram"}}]]}


def _menu_kb(lang: str | None = None) -> dict:
    """Единое меню команд для /menu и /start. Кнопки сгруппированы по смыслу:
    работа со встречами, задачи/настроение, риски/знания, ассистент, приложение."""
    rows = [
        [{"text": i18n.t('bot.menu.agenda', lang), "callback_data": "cmd:agenda"},
         {"text": i18n.t('bot.menu.newMeeting', lang), "callback_data": "cmd:newmeeting"}],
        [{"text": i18n.t('bot.menu.tasks', lang), "callback_data": "cmd:tasks"},
         {"text": i18n.t('bot.menu.mood', lang), "callback_data": "cmd:mood"}],
        [{"text": i18n.t('bot.menu.risks', lang), "callback_data": "cmd:risks"},
         {"text": i18n.t('bot.menu.knowledge', lang), "callback_data": "cmd:knowledge"}],
        [{"text": i18n.t('bot.menu.askPit', lang), "callback_data": "cmd:ask"},
         {"text": i18n.t('bot.menu.support', lang), "callback_data": "cmd:support"}],
        [{"text": "Язык / Language / Тіл", "callback_data": "cmd:language"}],
    ]
    web = _web_url()
    if web:
        rows.append([{"text": i18n.t('bot.action.openApp', lang), "web_app": {"url": f"{web}/telegram"}}])
    return {"inline_keyboard": rows}


def _cmd_language(db, chat_id, user) -> None:
    """Выбор языка (/language). Язык сохраняется в профиль, поэтому применяется
    и в вебе, и в приложении, и в ответах бота — одно значение на аккаунт."""
    if not user:
        tg.send_message(chat_id, i18n.t("bot.language.needAccount"))
        return
    lang = i18n.user_lang(user)
    rows = [[{"text": label, "callback_data": f"lang:{code}"}]
            for code, label in (("ru", "Русский"), ("en", "English"), ("kz", "Қазақша"))]
    tg.send_message(chat_id, i18n.t("bot.language.title", lang), reply_markup={"inline_keyboard": rows})


def _set_language(db, chat_id, user, code: str) -> None:
    """Сохранить выбранный язык в профиль пользователя (явный выбор)."""
    lang = i18n.user_lang(user)
    code = i18n.normalize_lang(code)
    user.preferred_language = code
    db.commit()
    tg.send_message(chat_id, i18n.t("bot.language.changed", code))


def _kb(rows) -> dict:
    return {"inline_keyboard": rows}


# ---- состояние диалогов -----------------------------------------------------

def _get_state(db, tid):
    return db.query(TelegramBotState).filter(TelegramBotState.telegram_id == tid).first()


def _set_state(db, tid, flow, step, data):
    st = _get_state(db, tid)
    if not st:
        st = TelegramBotState(telegram_id=tid)
        db.add(st)
    st.flow, st.step, st.data = flow, step, data
    db.commit()


def _clear_state(db, tid):
    st = _get_state(db, tid)
    if st:
        db.delete(st); db.commit()


# ---- общие выборки ----------------------------------------------------------

def _teams_led(db, user):
    return db.query(Team).filter(Team.team_lead_id == user.id).all()


def _user_team_ids(db, user):
    lead = [t.id for t in db.query(Team).filter(Team.team_lead_id == user.id).all()]
    member = [m.team_id for m in db.query(TeamMember).filter(TeamMember.user_id == user.id).all()]
    seen, out = set(), []
    for tid in lead + member:
        if tid not in seen:
            seen.add(tid); out.append(tid)
    return out


def _first_team_id(db, user):
    ids = _user_team_ids(db, user)
    return ids[0] if ids else None


def _nearest_meeting(db, user):
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


def _parse_dt(text: str):
    """Разобрать дату/время. Форматы ДД.ММ ЧЧ:ММ и ДД.ММ.ГГГГ ЧЧ:ММ."""
    text = text.strip()
    for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%y %H:%M", "%d.%m %H:%M"):
        try:
            dt = datetime.strptime(text, fmt)
            if fmt == "%d.%m %H:%M":
                dt = dt.replace(year=datetime.utcnow().year)
                if dt < datetime.utcnow():
                    dt = dt.replace(year=dt.year + 1)
            return dt
        except ValueError:
            continue
    return None


# ---- команды (текст) --------------------------------------------------------

def _cmd_start(db, chat_id, tg_data):
    user = tg.find_by_telegram_id(db, tg_data["id"])
    lang = i18n.user_lang(user) if user else i18n.DEFAULT_LANG
    if not user:
        user = tg.create_from_telegram(db, tg_data)
        greeting = f"Добро пожаловать в OneOnOne, {tg_data.get('first_name') or ''}. Аккаунт создан."
    else:
        greeting = i18n.t('bot.start.welcomeBack', lang, name=user.name)
    tg.send_message(
        chat_id,
        greeting + i18n.t('bot.start.chooseAction', lang),
        reply_markup=_menu_kb(lang),
    )


def _cmd_menu(db, chat_id, user):
    lang = i18n.user_lang(user)
    tg.send_message(
        chat_id,
        i18n.t('bot.menu.title', lang),
        reply_markup=_menu_kb(lang),
    )


def _cmd_link(db, chat_id, tg_data):
    # Аккаунта ещё нет — язык профиля неизвестен, отвечаем языком по умолчанию.
    code = tg.issue_link_code(db, tg_data)
    tg.send_message(chat_id, i18n.t('bot.link.instructions', None, code=code))


def _cmd_agenda(db, chat_id, user, arg: str):
    lang = i18n.user_lang(user)
    m = _nearest_meeting(db, user)
    if not m:
        tg.send_message(chat_id, i18n.t('bot.agenda.noMeetings', lang))
        return
    when = m.scheduled_date.strftime("%d.%m %H:%M") if m.scheduled_date else ""
    if arg.strip():
        line = arg.strip()
        m.agenda = (m.agenda + "\n" + line) if m.agenda else line
        db.commit()
        tg.send_message(chat_id, i18n.t('bot.agenda.added', lang, when=when, line=line))
    else:
        body = m.agenda.strip() if m.agenda else i18n.t('bot.agenda.empty', lang)
        tg.send_message(chat_id, i18n.t('bot.agenda.list', lang, when=when, body=body))


def _cmd_ask(db, chat_id, user, question: str):
    lang = i18n.user_lang(user)
    q = question.strip()
    if not q:
        tg.send_message(chat_id, i18n.t('bot.ask.hint', lang))
        return
    try:
        from app.routers.assistant import pit_chat, ChatRequest, ChatMessage
        result = pit_chat(ChatRequest(messages=[ChatMessage(role="user", content=q)]))
        tg.send_message(chat_id, result.get("reply") or i18n.t('bot.ask.failed', lang))
    except Exception:
        tg.send_message(chat_id, i18n.t('bot.ask.unavailable', lang))


def _cmd_knowledge(db, chat_id, user, query: str):
    lang = i18n.user_lang(user)
    q = query.strip().lower()
    if not q:
        tg.send_message(chat_id, i18n.t('bot.knowledge.hint', lang))
        return
    team_ids = _user_team_ids(db, user)
    rows = db.query(KnowledgeArticle).filter(
        KnowledgeArticle.team_id.in_(team_ids) if team_ids else False).all()
    rows += db.query(KnowledgeArticle).filter(KnowledgeArticle.team_id.is_(None)).all()
    hits = [a for a in rows if q in (a.title or "").lower() or q in (a.content or "").lower()]
    if not hits:
        tg.send_message(chat_id, i18n.t('bot.knowledge.nothing', lang))
        return
    top = hits[0]
    text = f"{top.title}\n\n{(top.content or '')[:1500]}"
    if len(hits) > 1:
        text += i18n.t('bot.knowledge.more', lang) + "; ".join(a.title for a in hits[1:4])
    tg.send_message(chat_id, text)


def _cmd_tasks(db, chat_id, user):
    """Открытые задачи пользователя с кнопками смены статуса (Task/update_task)."""
    lang = i18n.user_lang(user)
    tasks = (
        db.query(Task)
        .filter(Task.assigned_to == user.id, Task.status != "done")
        .order_by(Task.created_at.desc())
        .limit(5).all()
    )
    if not tasks:
        tg.send_message(chat_id, i18n.t('bot.tasks.none', lang))
        return
    for tk in tasks:
        _send_task_card(db, chat_id, tk, lang=lang)


def _send_task_card(db, chat_id, tk, message_id=None, lang: str | None = None):
    label = status_labels(lang).get(tk.status, tk.status)
    text = i18n.t('bot.tasks.card', lang, title=tk.title, label=label)
    # Основное действие («Отметить выполненной») — отдельным первым рядом;
    # второстепенные статусы — рядом ниже, по двое. Порядок везде одинаковый.
    rows = []
    if tk.status != "done":
        rows.append([{"text": status_btn(lang)["done"], "callback_data": f"task:{tk.id}:done"}])
    secondary = [s for s in ("in_progress", "review", "blocked") if s != tk.status]
    sec = [{"text": status_btn(lang)[s], "callback_data": f"task:{tk.id}:{s}"} for s in secondary]
    for j in range(0, len(sec), 2):
        rows.append(sec[j:j + 2])
    if message_id:
        tg.edit_message_text(chat_id, message_id, text, reply_markup=_kb(rows))
    else:
        tg.send_message(chat_id, text, reply_markup=_kb(rows))


def _cmd_mood(db, chat_id, user):
    lang = i18n.user_lang(user)
    tid = _first_team_id(db, user)
    if not tid:
        tg.send_message(chat_id, i18n.t('bot.noTeam', lang))
        return
    _send_mood_question(chat_id, tid, lang)


def _send_mood_question(chat_id, team_id, lang: str | None = None):
    rows = [[{"text": str(s), "callback_data": f"mood:{team_id}:{s}"} for s in range(1, 6)]]
    tg.send_message(chat_id, i18n.t('bot.mood.question', lang), reply_markup=_kb(rows))


def _cmd_risks(db, chat_id, user):
    """Участники в зоне риска (просроченные встречи) — из существующей логики
    build_team_detail (status_color). Всегда отвечает, даже если данных нет."""
    lang = i18n.user_lang(user)
    try:
        teams = _teams_led(db, user)
        if not teams:
            tg.send_message(
                chat_id,
                i18n.t('bot.risks.noTeams', lang)
            )
            return
        from app.routers.team import build_team_detail
        any_member = False
        any_risk = False
        for team in teams:
            detail = build_team_detail(team, team.id, db)
            members = [m for m in detail.members if m.role != "lead"]
            if members:
                any_member = True
            for m in members:
                if m.status_color not in ("red", "yellow"):
                    continue
                any_risk = True
                level = i18n.t('bot.risk.high', lang) if m.status_color == "red" else i18n.t('bot.risk.medium', lang)
                # Основное действие слева, второстепенное справа; оба — в полряда.
                rows = [[
                    {"text": i18n.t('bot.action.scheduleMeeting', lang), "callback_data": f"risk_meet:{team.id}:{m.user_id}"},
                    {"text": i18n.t('bot.action.showContact', lang), "callback_data": f"risk_msg:{m.user_id}"},
                ]]
                tg.send_message(chat_id, i18n.t('bot.risk.line', lang, level=level, name=m.user_name), reply_markup=_kb(rows))
        if not any_member:
            tg.send_message(chat_id, i18n.t('bot.risks.noMembers', lang))
        elif not any_risk:
            tg.send_message(chat_id, i18n.t('bot.risks.none', lang))
    except Exception:
        tg.send_message(chat_id, i18n.t('bot.risks.failed', lang))


def _cmd_support(db, chat_id, user):
    """Связь с поддержкой: следующее сообщение пользователя станет обращением."""
    lang = i18n.user_lang(user)
    _set_state(db, user.telegram_id, "support", "await_text", {})
    tg.send_message(
        chat_id,
        i18n.t('bot.support.prompt', lang)
    )


# ---- /newmeeting (пошаговый диалог) ----------------------------------------

def _nm_start(db, chat_id, user):
    lang = i18n.user_lang(user)
    teams = _teams_led(db, user)
    if not teams:
        tg.send_message(chat_id, i18n.t('bot.meeting.onlyLead', lang))
        return
    _set_state(db, user.telegram_id, "newmeeting", "await_member", {})
    if len(teams) == 1:
        _nm_ask_member(db, chat_id, user, teams[0].id)
    else:
        rows = [[{"text": t.name, "callback_data": f"nm_team:{t.id}"}] for t in teams]
        tg.send_message(chat_id, i18n.t('bot.meeting.chooseTeam', lang), reply_markup=_kb(rows))


def _nm_ask_member(db, chat_id, user, team_id):
    lang = i18n.user_lang(user)
    members = db.query(TeamMember).filter(TeamMember.team_id == team_id, TeamMember.role != "lead").all()
    if not members:
        tg.send_message(chat_id, i18n.t('bot.meeting.noMembers', lang))
        _clear_state(db, user.telegram_id)
        return
    _set_state(db, user.telegram_id, "newmeeting", "await_member", {"team_id": team_id})
    rows = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        rows.append([{"text": (u.name if u else f"#{m.user_id}"), "callback_data": f"nm_member:{m.user_id}"}])
    tg.send_message(chat_id, i18n.t('bot.meeting.chooseMember', lang), reply_markup=_kb(rows))


def _nm_ask_datetime(db, chat_id, user, team_id, member_id):
    lang = i18n.user_lang(user)
    _set_state(db, user.telegram_id, "newmeeting", "await_datetime",
               {"team_id": team_id, "member_id": member_id})
    tg.send_message(chat_id, i18n.t('bot.meeting.enterDate', lang))


def _nm_create(db, chat_id, user, dt):
    lang = i18n.user_lang(user)
    st = _get_state(db, user.telegram_id)
    data = (st.data if st else {}) or {}
    team_id, member_id = data.get("team_id"), data.get("member_id")
    _clear_state(db, user.telegram_id)
    if not team_id or not member_id:
        tg.send_message(chat_id, i18n.t('bot.meeting.missingData', lang))
        return
    try:
        from app.routers.meeting import create_meeting
        from app.schemas.meeting import MeetingCreate
        create_meeting(MeetingCreate(team_id=team_id, team_lead_id=user.id,
                                     member_id=member_id, scheduled_date=dt), db)
        tg.send_message(chat_id, f"Встреча создана на {dt.strftime('%d.%m %H:%M')}.")
    except Exception as e:
        detail = getattr(e, "detail", None)
        tg.send_message(chat_id, i18n.t('bot.meeting.failedDetail', lang, detail=detail) if detail else i18n.t('bot.meeting.failed', lang))


# ---- callback-кнопки --------------------------------------------------------

def _handle_callback(db, cq):
    data = cq.get("data") or ""
    frm = cq.get("from") or {}
    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    message_id = msg.get("message_id")
    cq_id = cq.get("id")
    user = tg.find_by_telegram_id(db, frm.get("id"))
    lang = i18n.user_lang(user) if user else i18n.DEFAULT_LANG
    if not user or not chat_id:
        tg.answer_callback(cq_id, i18n.t('bot.needStart', lang))
        return

    try:
        if data.startswith("task:"):
            _, tid, status = data.split(":", 2)
            from app.routers.task import update_task
            from app.schemas.task import TaskUpdate
            tk = update_task(int(tid), TaskUpdate(status=status), db)
            _send_task_card(db, chat_id, tk, message_id=message_id, lang=lang)
            tg.answer_callback(cq_id, i18n.t('bot.task.status', lang, label=status_labels(lang).get(status, status)))

        elif data.startswith("mood:"):
            _, team_id, score = data.split(":", 2)
            from app.routers.mood import submit_mood, MoodCreate
            # Автора берём из привязанного Telegram-пользователя: с user_id запись
            # участвует в дедупе за день и в личном ряду настроения. current=None
            # — вызов идёт напрямую, минуя зависимость токена.
            submit_mood(MoodCreate(team_id=int(team_id), score=int(score), user_id=user.id), db, current=None)
            tg.edit_message_text(chat_id, message_id, i18n.t('bot.mood.saved', lang, score=score))
            tg.answer_callback(cq_id, i18n.t('bot.saved', lang))

        elif data.startswith("nm_team:"):
            team_id = int(data.split(":", 1)[1])
            tg.answer_callback(cq_id)
            _nm_ask_member(db, chat_id, user, team_id)

        elif data.startswith("nm_member:"):
            member_id = int(data.split(":", 1)[1])
            st = _get_state(db, user.telegram_id)
            team_id = (st.data or {}).get("team_id") if st else None
            if not team_id:
                tg.answer_callback(cq_id, i18n.t('bot.startOver', lang)); return
            tg.answer_callback(cq_id)
            _nm_ask_datetime(db, chat_id, user, team_id, member_id)

        elif data.startswith("risk_meet:"):
            _, team_id, member_id = data.split(":", 2)
            tg.answer_callback(cq_id)
            _nm_ask_datetime(db, chat_id, user, int(team_id), int(member_id))

        elif data.startswith("risk_msg:"):
            member_id = int(data.split(":", 1)[1])
            m = db.query(User).filter(User.id == member_id).first()
            contact = (m.telegram or m.email or i18n.t('bot.notSet', lang)) if m else i18n.t('bot.notFound', lang)
            tg.answer_callback(cq_id)
            tg.send_message(chat_id, f"Контакт {m.name if m else ''}: {contact}")

        elif data.startswith("lang:"):
            tg.answer_callback(cq_id)
            _set_language(db, chat_id, user, data.split(":", 1)[1])

        elif data.startswith("cmd:"):
            # Кнопки меню запускают те же команды.
            cmd = data.split(":", 1)[1]
            tg.answer_callback(cq_id)
            if cmd == "agenda":
                _cmd_agenda(db, chat_id, user, "")
            elif cmd == "newmeeting":
                _nm_start(db, chat_id, user)
            elif cmd == "tasks":
                _cmd_tasks(db, chat_id, user)
            elif cmd == "mood":
                _cmd_mood(db, chat_id, user)
            elif cmd == "risks":
                _cmd_risks(db, chat_id, user)
            elif cmd == "knowledge":
                tg.send_message(chat_id, i18n.t('bot.knowledge.usage', lang))
            elif cmd == "ask":
                tg.send_message(chat_id, i18n.t('bot.ask.usage', lang))
            elif cmd == "support":
                _cmd_support(db, chat_id, user)
            elif cmd == "language":
                _cmd_language(db, chat_id, user)
        else:
            tg.answer_callback(cq_id)
    except Exception:
        tg.answer_callback(cq_id, i18n.t('bot.error', lang))


# ---- рассылка чек-ина (вызывается джобом) -----------------------------------

def send_mood_checkins(db: Session) -> int:
    """Разослать вопрос настроения пользователям с привязанным Telegram, у кого
    есть команда. Возвращает число отправленных. Вызывается ежедневным джобом."""
    sent = 0
    users = db.query(User).filter(User.telegram_id.isnot(None), User.is_blocked == False).all()  # noqa: E712
    for u in users:
        tid = _first_team_id(db, u)
        if not tid:
            continue
        _send_mood_question(u.telegram_id, tid)
        sent += 1
    return sent


# ---- точка входа -----------------------------------------------------------

def handle_update(db: Session, update: dict) -> None:
    if "callback_query" in update:
        _handle_callback(db, update["callback_query"])
        return

    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    frm = message.get("from") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not frm or not chat_id:
        return

    tg_data = {"id": frm.get("id"), "first_name": frm.get("first_name"),
               "username": frm.get("username"), "photo_url": None}

    if text.startswith("/start"):
        _cmd_start(db, chat_id, tg_data); return
    if text.startswith("/link"):
        _cmd_link(db, chat_id, tg_data); return

    user = tg.find_by_telegram_id(db, tg_data["id"])
    lang = i18n.user_lang(user) if user else i18n.DEFAULT_LANG
    if not user:
        tg.send_message(chat_id, i18n.t('bot.needStartToLogin', lang))
        return

    if text.startswith("/cancel"):
        _clear_state(db, user.telegram_id)
        tg.send_message(chat_id, i18n.t('bot.cancelled', lang))
        return

    # Ввод в активном диалоге имеет приоритет над свободным текстом.
    st = _get_state(db, user.telegram_id)
    if st and st.flow == "newmeeting" and st.step == "await_datetime" and not text.startswith("/"):
        dt = _parse_dt(text)
        if not dt:
            tg.send_message(chat_id, i18n.t('bot.badDate', lang))
            return
        _nm_create(db, chat_id, user, dt)
        return
    if st and st.flow == "support" and st.step == "await_text" and not text.startswith("/"):
        _clear_state(db, user.telegram_id)
        try:
            from app.routers.support import create_ticket, TicketCreate
            create_ticket(TicketCreate(user_id=user.id, subject=i18n.t('bot.support.subject', lang), body=text), db)
            tg.send_message(chat_id, i18n.t('bot.support.sent', lang))
        except Exception:
            tg.send_message(chat_id, i18n.t('bot.support.failed', lang))
        return

    def arg_after(cmd):
        return text[len(cmd):].strip()

    if text.startswith("/menu"):
        _cmd_menu(db, chat_id, user)
    elif text.startswith("/newmeeting"):
        _nm_start(db, chat_id, user)
    elif text.startswith("/agenda"):
        _cmd_agenda(db, chat_id, user, arg_after("/agenda"))
    elif text.startswith("/tasks"):
        _cmd_tasks(db, chat_id, user)
    elif text.startswith("/mood"):
        _cmd_mood(db, chat_id, user)
    elif text.startswith("/risks"):
        _cmd_risks(db, chat_id, user)
    elif text.startswith("/language"):
        _cmd_language(db, chat_id, user)
    elif text.startswith("/support"):
        _cmd_support(db, chat_id, user)
    elif text.startswith("/knowledge"):
        _cmd_knowledge(db, chat_id, user, arg_after("/knowledge"))
    elif text.startswith("/ask"):
        _cmd_ask(db, chat_id, user, arg_after("/ask"))
    elif text.startswith("/"):
        tg.send_message(chat_id, i18n.t('bot.commands', lang))
    else:
        _cmd_ask(db, chat_id, user, text)
