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

STATUS_LABELS = {"in_progress": "В работе", "review": "На ревью", "blocked": "Блокер", "done": "Готово"}
# Подписи на кнопках смены статуса: основное действие сформулировано явно.
STATUS_BTN = {"in_progress": "Вернуть в работу", "review": "На ревью", "blocked": "Отметить блокером", "done": "Отметить выполненной"}


def _web_url() -> str:
    return (settings.app_web_url or "").rstrip("/")


def _miniapp_button() -> dict | None:
    web = _web_url()
    if not web:
        return None
    return {"inline_keyboard": [[{"text": "Открыть приложение", "web_app": {"url": f"{web}/telegram"}}]]}


def _menu_kb() -> dict:
    """Единое меню команд для /menu и /start. Кнопки сгруппированы по смыслу:
    работа со встречами, задачи/настроение, риски/знания, ассистент, приложение."""
    rows = [
        [{"text": "Повестка", "callback_data": "cmd:agenda"},
         {"text": "Создать встречу", "callback_data": "cmd:newmeeting"}],
        [{"text": "Задачи", "callback_data": "cmd:tasks"},
         {"text": "Настроение", "callback_data": "cmd:mood"}],
        [{"text": "Риски", "callback_data": "cmd:risks"},
         {"text": "База знаний", "callback_data": "cmd:knowledge"}],
        [{"text": "Спросить Пита", "callback_data": "cmd:ask"},
         {"text": "Поддержка", "callback_data": "cmd:support"}],
    ]
    web = _web_url()
    if web:
        rows.append([{"text": "Открыть приложение", "web_app": {"url": f"{web}/telegram"}}])
    return {"inline_keyboard": rows}


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
    if not user:
        user = tg.create_from_telegram(db, tg_data)
        greeting = f"Добро пожаловать в OneOnOne, {tg_data.get('first_name') or ''}. Аккаунт создан."
    else:
        greeting = f"С возвращением, {user.name}."
    tg.send_message(
        chat_id,
        greeting + "\n\nВыберите действие ниже или откройте приложение.",
        reply_markup=_menu_kb(),
    )


def _cmd_menu(db, chat_id, user):
    tg.send_message(
        chat_id,
        "Меню OneOnOne. Выберите действие:",
        reply_markup=_menu_kb(),
    )


def _cmd_link(db, chat_id, tg_data):
    code = tg.issue_link_code(db, tg_data)
    tg.send_message(
        chat_id,
        "Чтобы связать Telegram с аккаунтом по email, войдите на сайте, откройте меню профиля, "
        f"пункт «Привязать Telegram», и введите код:\n\n{code}\n\nКод действует 30 минут."
    )


def _cmd_agenda(db, chat_id, user, arg: str):
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
    q = query.strip().lower()
    if not q:
        tg.send_message(chat_id, "Укажите запрос: /knowledge онбординг.")
        return
    team_ids = _user_team_ids(db, user)
    rows = db.query(KnowledgeArticle).filter(
        KnowledgeArticle.team_id.in_(team_ids) if team_ids else False).all()
    rows += db.query(KnowledgeArticle).filter(KnowledgeArticle.team_id.is_(None)).all()
    hits = [a for a in rows if q in (a.title or "").lower() or q in (a.content or "").lower()]
    if not hits:
        tg.send_message(chat_id, "По запросу ничего не найдено.")
        return
    top = hits[0]
    text = f"{top.title}\n\n{(top.content or '')[:1500]}"
    if len(hits) > 1:
        text += "\n\nЕщё найдено: " + "; ".join(a.title for a in hits[1:4])
    tg.send_message(chat_id, text)


def _cmd_tasks(db, chat_id, user):
    """Открытые задачи пользователя с кнопками смены статуса (Task/update_task)."""
    tasks = (
        db.query(Task)
        .filter(Task.assigned_to == user.id, Task.status != "done")
        .order_by(Task.created_at.desc())
        .limit(5).all()
    )
    if not tasks:
        tg.send_message(chat_id, "Открытых задач нет.")
        return
    for tk in tasks:
        _send_task_card(db, chat_id, tk)


def _send_task_card(db, chat_id, tk, message_id=None):
    label = STATUS_LABELS.get(tk.status, tk.status)
    text = f"Задача: {tk.title}\nТекущий статус: {label}\nВыберите новый статус:"
    # Основное действие («Отметить выполненной») — отдельным первым рядом;
    # второстепенные статусы — рядом ниже, по двое. Порядок везде одинаковый.
    rows = []
    if tk.status != "done":
        rows.append([{"text": STATUS_BTN["done"], "callback_data": f"task:{tk.id}:done"}])
    secondary = [s for s in ("in_progress", "review", "blocked") if s != tk.status]
    sec = [{"text": STATUS_BTN[s], "callback_data": f"task:{tk.id}:{s}"} for s in secondary]
    for j in range(0, len(sec), 2):
        rows.append(sec[j:j + 2])
    if message_id:
        tg.edit_message_text(chat_id, message_id, text, reply_markup=_kb(rows))
    else:
        tg.send_message(chat_id, text, reply_markup=_kb(rows))


def _cmd_mood(db, chat_id, user):
    tid = _first_team_id(db, user)
    if not tid:
        tg.send_message(chat_id, "Вы пока не в команде.")
        return
    _send_mood_question(chat_id, tid)


def _send_mood_question(chat_id, team_id):
    rows = [[{"text": str(s), "callback_data": f"mood:{team_id}:{s}"} for s in range(1, 6)]]
    tg.send_message(chat_id, "Как настроение сегодня? Оцените от 1 (плохо) до 5 (отлично).", reply_markup=_kb(rows))


def _cmd_risks(db, chat_id, user):
    """Участники в зоне риска (просроченные встречи) — из существующей логики
    build_team_detail (status_color). Всегда отвечает, даже если данных нет."""
    try:
        teams = _teams_led(db, user)
        if not teams:
            tg.send_message(
                chat_id,
                "У вас пока нет команд как у тимлида. Риски появятся, когда вы "
                "создадите команду и начнёте проводить встречи."
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
                level = "высокий" if m.status_color == "red" else "средний"
                # Основное действие слева, второстепенное справа; оба — в полряда.
                rows = [[
                    {"text": "Назначить встречу", "callback_data": f"risk_meet:{team.id}:{m.user_id}"},
                    {"text": "Показать контакт", "callback_data": f"risk_msg:{m.user_id}"},
                ]]
                tg.send_message(chat_id, f"Риск ({level}): {m.user_name} — давно не было встречи.", reply_markup=_kb(rows))
        if not any_member:
            tg.send_message(chat_id, "В ваших командах пока нет участников — риски оценивать не по кому. Добавьте участников в приложении.")
        elif not any_risk:
            tg.send_message(chat_id, "Рисков не обнаружено: встречи проходят вовремя.")
    except Exception:
        tg.send_message(chat_id, "Не удалось получить риски, попробуйте позже.")


def _cmd_support(db, chat_id, user):
    """Связь с поддержкой: следующее сообщение пользователя станет обращением."""
    _set_state(db, user.telegram_id, "support", "await_text", {})
    tg.send_message(
        chat_id,
        "Опишите ваш вопрос одним сообщением — мы создадим обращение в поддержку. "
        "Ответ придёт в этот чат и в приложение. Отмена — /cancel."
    )


# ---- /newmeeting (пошаговый диалог) ----------------------------------------

def _nm_start(db, chat_id, user):
    teams = _teams_led(db, user)
    if not teams:
        tg.send_message(chat_id, "Создавать встречи может тимлид команды.")
        return
    _set_state(db, user.telegram_id, "newmeeting", "await_member", {})
    if len(teams) == 1:
        _nm_ask_member(db, chat_id, user, teams[0].id)
    else:
        rows = [[{"text": t.name, "callback_data": f"nm_team:{t.id}"}] for t in teams]
        tg.send_message(chat_id, "Выберите команду:", reply_markup=_kb(rows))


def _nm_ask_member(db, chat_id, user, team_id):
    members = db.query(TeamMember).filter(TeamMember.team_id == team_id, TeamMember.role != "lead").all()
    if not members:
        tg.send_message(chat_id, "В команде нет участников для встречи.")
        _clear_state(db, user.telegram_id)
        return
    _set_state(db, user.telegram_id, "newmeeting", "await_member", {"team_id": team_id})
    rows = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        rows.append([{"text": (u.name if u else f"#{m.user_id}"), "callback_data": f"nm_member:{m.user_id}"}])
    tg.send_message(chat_id, "Выберите участника:", reply_markup=_kb(rows))


def _nm_ask_datetime(db, chat_id, user, team_id, member_id):
    _set_state(db, user.telegram_id, "newmeeting", "await_datetime",
               {"team_id": team_id, "member_id": member_id})
    tg.send_message(chat_id, "Введите дату и время в формате ДД.ММ ЧЧ:ММ (например 05.08 14:30). Отмена — /cancel.")


def _nm_create(db, chat_id, user, dt):
    st = _get_state(db, user.telegram_id)
    data = (st.data if st else {}) or {}
    team_id, member_id = data.get("team_id"), data.get("member_id")
    _clear_state(db, user.telegram_id)
    if not team_id or not member_id:
        tg.send_message(chat_id, "Не хватает данных, начните заново: /newmeeting")
        return
    try:
        from app.routers.meeting import create_meeting
        from app.schemas.meeting import MeetingCreate
        create_meeting(MeetingCreate(team_id=team_id, team_lead_id=user.id,
                                     member_id=member_id, scheduled_date=dt), db)
        tg.send_message(chat_id, f"Встреча создана на {dt.strftime('%d.%m %H:%M')}.")
    except Exception as e:
        detail = getattr(e, "detail", None)
        tg.send_message(chat_id, f"Не удалось создать встречу: {detail}" if detail else "Не удалось создать встречу.")


# ---- callback-кнопки --------------------------------------------------------

def _handle_callback(db, cq):
    data = cq.get("data") or ""
    frm = cq.get("from") or {}
    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    message_id = msg.get("message_id")
    cq_id = cq.get("id")
    user = tg.find_by_telegram_id(db, frm.get("id"))
    if not user or not chat_id:
        tg.answer_callback(cq_id, "Сначала отправьте /start")
        return

    try:
        if data.startswith("task:"):
            _, tid, status = data.split(":", 2)
            from app.routers.task import update_task
            from app.schemas.task import TaskUpdate
            tk = update_task(int(tid), TaskUpdate(status=status), db)
            _send_task_card(db, chat_id, tk, message_id=message_id)
            tg.answer_callback(cq_id, f"Статус: {STATUS_LABELS.get(status, status)}")

        elif data.startswith("mood:"):
            _, team_id, score = data.split(":", 2)
            from app.routers.mood import submit_mood, MoodCreate
            # Автора берём из привязанного Telegram-пользователя: с user_id запись
            # участвует в дедупе за день и в личном ряду настроения. current=None
            # — вызов идёт напрямую, минуя зависимость токена.
            submit_mood(MoodCreate(team_id=int(team_id), score=int(score), user_id=user.id), db, current=None)
            tg.edit_message_text(chat_id, message_id, f"Спасибо, оценка {score} сохранена.")
            tg.answer_callback(cq_id, "Сохранено")

        elif data.startswith("nm_team:"):
            team_id = int(data.split(":", 1)[1])
            tg.answer_callback(cq_id)
            _nm_ask_member(db, chat_id, user, team_id)

        elif data.startswith("nm_member:"):
            member_id = int(data.split(":", 1)[1])
            st = _get_state(db, user.telegram_id)
            team_id = (st.data or {}).get("team_id") if st else None
            if not team_id:
                tg.answer_callback(cq_id, "Начните заново: /newmeeting"); return
            tg.answer_callback(cq_id)
            _nm_ask_datetime(db, chat_id, user, team_id, member_id)

        elif data.startswith("risk_meet:"):
            _, team_id, member_id = data.split(":", 2)
            tg.answer_callback(cq_id)
            _nm_ask_datetime(db, chat_id, user, int(team_id), int(member_id))

        elif data.startswith("risk_msg:"):
            member_id = int(data.split(":", 1)[1])
            m = db.query(User).filter(User.id == member_id).first()
            contact = (m.telegram or m.email or "не указан") if m else "не найден"
            tg.answer_callback(cq_id)
            tg.send_message(chat_id, f"Контакт {m.name if m else ''}: {contact}")

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
                tg.send_message(chat_id, "Поиск по базе знаний: отправьте сообщение /knowledge и запрос, например: /knowledge онбординг.")
            elif cmd == "ask":
                tg.send_message(chat_id, "Вопрос ассистенту: отправьте сообщение /ask и текст, например: /ask как подготовиться к встрече.")
            elif cmd == "support":
                _cmd_support(db, chat_id, user)
        else:
            tg.answer_callback(cq_id)
    except Exception:
        tg.answer_callback(cq_id, "Ошибка, попробуйте позже")


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
    if not user:
        tg.send_message(chat_id, "Сначала отправьте /start, чтобы войти.")
        return

    if text.startswith("/cancel"):
        _clear_state(db, user.telegram_id)
        tg.send_message(chat_id, "Отменено.")
        return

    # Ввод в активном диалоге имеет приоритет над свободным текстом.
    st = _get_state(db, user.telegram_id)
    if st and st.flow == "newmeeting" and st.step == "await_datetime" and not text.startswith("/"):
        dt = _parse_dt(text)
        if not dt:
            tg.send_message(chat_id, "Не понял дату. Формат: ДД.ММ ЧЧ:ММ (например 05.08 14:30).")
            return
        _nm_create(db, chat_id, user, dt)
        return
    if st and st.flow == "support" and st.step == "await_text" and not text.startswith("/"):
        _clear_state(db, user.telegram_id)
        try:
            from app.routers.support import create_ticket, TicketCreate
            create_ticket(TicketCreate(user_id=user.id, subject="Обращение из Telegram", body=text), db)
            tg.send_message(chat_id, "Обращение отправлено в поддержку. Ответ придёт в этот чат и в приложение.")
        except Exception:
            tg.send_message(chat_id, "Не удалось отправить обращение, попробуйте позже.")
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
    elif text.startswith("/support"):
        _cmd_support(db, chat_id, user)
    elif text.startswith("/knowledge"):
        _cmd_knowledge(db, chat_id, user, arg_after("/knowledge"))
    elif text.startswith("/ask"):
        _cmd_ask(db, chat_id, user, arg_after("/ask"))
    elif text.startswith("/"):
        tg.send_message(chat_id, "Команды: /agenda, /newmeeting, /tasks, /mood, /risks, /ask, /knowledge, /support, /menu.")
    else:
        _cmd_ask(db, chat_id, user, text)
