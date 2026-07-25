"""Общий AI-слой доступа к данным и прав. ЕДИНЫЙ для Пита и ONE AI.

Здесь собирается контекст из разных модулей (задачи, встречи, аналитика,
настроение, цели, развитие, база знаний) через уже существующие сервисы —
и здесь же ДЕТЕРМИНИРОВАННО, на бэкенде, ДО обращения к модели проверяются
права по ролям. Оба интерфейса берут данные отсюда, поэтому права не могут
разойтись между ними.

Ограничение объёма для LLM: контекст собирается как АГРЕГАТЫ и короткие срезы
(счётчики по статусам, последние N элементов, готовые сводки аналитики), а не
как вся история целиком.
"""
from datetime import datetime, timedelta, date
from typing import Optional, Tuple
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.task import Task
from app.models.meeting import Meeting
from app.models.goal import Goal
from app.models.knowledge import KnowledgeArticle
from app.services import development_analytics
from app.services import mood_service

RECENT_LIMIT = 6            # сколько последних элементов включаем в контекст
KNOWLEDGE_LIMIT = 6

TASK_STATUS_RU = {"in_progress": "в работе", "blocked": "заблокирована",
                  "review": "на проверке", "done": "выполнена"}


# ── права ─────────────────────────────────────────────────────────────────────

def _name(db: Session, uid: int) -> str:
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else f"#{uid}"


def _teams_led(db: Session, actor_id: int):
    return db.query(Team).filter(Team.team_lead_id == actor_id).all()


def is_lead_of_team(db: Session, actor_id: int, team_id: int) -> bool:
    t = db.query(Team).filter(Team.id == team_id).first()
    return bool(t and t.team_lead_id == actor_id)


def member_in_actor_team(db: Session, actor_id: int, target_id: int) -> bool:
    """target входит в одну из команд, которыми руководит actor."""
    led = {t.id for t in _teams_led(db, actor_id)}
    if not led:
        return False
    rows = db.query(TeamMember).filter(TeamMember.user_id == target_id).all()
    return any(r.team_id in led for r in rows)


def can_view_user(db: Session, actor_id: int, target_id: int) -> bool:
    return actor_id == target_id or member_in_actor_team(db, actor_id, target_id)


# ── факты по сотруднику (агрегаты) ────────────────────────────────────────────

def member_facts(db: Session, uid: int) -> dict:
    now = datetime.utcnow()
    tasks = db.query(Task).filter(Task.assigned_to == uid).all()
    by_status = {}
    for t in tasks:
        st = t.status if t.status else ("done" if t.completed else "in_progress")
        by_status[st] = by_status.get(st, 0) + 1
    done = sum(1 for t in tasks if t.completed or t.status == "done")
    recent_tasks = sorted(tasks, key=lambda t: t.created_at or now, reverse=True)[:RECENT_LIMIT]
    overdue = sum(1 for t in tasks if t.due_date and not (t.completed or t.status == "done") and t.due_date < now)

    meetings = db.query(Meeting).filter(Meeting.member_id == uid, Meeting.status != "cancelled").all()
    last_meeting = max((m.scheduled_date for m in meetings), default=None)
    m30 = sum(1 for m in meetings if m.scheduled_date and m.scheduled_date >= now - timedelta(days=30))

    goals = db.query(Goal).filter(Goal.user_id == uid).all()
    goals_open = sum(1 for g in goals if g.status in ("not_started", "in_progress", "at_risk"))
    goals_avg = round(sum(g.progress for g in goals) / len(goals)) if goals else None

    dev = development_analytics.member_summary(db, uid)

    # Настроение (личный ряд за 30 дней) — среднее, без выгрузки всех точек.
    try:
        tm = db.query(TeamMember).filter(TeamMember.user_id == uid).first()
        tz = mood_service.team_tz(db, tm.team_id) if tm else mood_service.ZoneInfo("UTC")
        today = mood_service.now_local(tz).date()
        series = mood_service.user_series(db, uid, tz, today - timedelta(days=29), today)
        vals = [p["score"] for p in series if p.get("score")]
        mood_avg = round(sum(vals) / len(vals), 1) if vals else None
    except Exception:
        mood_avg = None

    return {
        "user_id": uid, "name": _name(db, uid),
        "tasks_total": len(tasks), "tasks_done": done, "tasks_overdue": overdue,
        "tasks_by_status": by_status,
        "recent_tasks": [{"id": t.id, "title": t.title or t.description or "",
                          "status": (t.status or ("done" if t.completed else "in_progress"))}
                         for t in recent_tasks],
        "meetings_total": len(meetings), "meetings_30d": m30,
        "last_meeting": last_meeting.strftime("%d.%m.%Y") if last_meeting else None,
        "goals_total": len(goals), "goals_open": goals_open, "goals_avg_progress": goals_avg,
        "dev": {"avg_level": dev.get("avg_current_level"), "gaps": dev.get("gaps"),
                "plan_progress": dev.get("plan", {}).get("plan_progress"),
                "overdue_steps": dev.get("plan", {}).get("overdue_steps")},
        "mood_avg_30d": mood_avg,
    }


def _fmt_member(f: dict, self_note: str = "") -> str:
    tasks_line = ", ".join(f"{TASK_STATUS_RU.get(k, k)}: {v}" for k, v in f["tasks_by_status"].items()) or "нет задач"
    rec = "; ".join(f'[task_id:{t["id"]}] "{t["title"]}" ({TASK_STATUS_RU.get(t["status"], t["status"])})'
                    for t in f["recent_tasks"]) or "—"
    return (
        f'{f["name"]} [id:{f["user_id"]}]{self_note}:\n'
        f'  Задачи: всего {f["tasks_total"]}, выполнено {f["tasks_done"]}, просрочено {f["tasks_overdue"]} ({tasks_line}). Недавние: {rec}\n'
        f'  Встречи: всего {f["meetings_total"]}, за 30 дней {f["meetings_30d"]}, последняя {f["last_meeting"] or "—"}\n'
        f'  Цели: всего {f["goals_total"]}, открытых {f["goals_open"]}, средний прогресс {f["goals_avg_progress"] if f["goals_avg_progress"] is not None else "—"}%\n'
        f'  Развитие: средний уровень {f["dev"]["avg_level"] if f["dev"]["avg_level"] is not None else "—"}, разрывов {f["dev"]["gaps"]}, прогресс плана {f["dev"]["plan_progress"]}%, просрочено шагов {f["dev"]["overdue_steps"]}\n'
        f'  Настроение (ср. за 30 дней): {f["mood_avg_30d"] if f["mood_avg_30d"] is not None else "—"}/5'
    )


def knowledge_snippets(db: Session, actor_id: int, query: Optional[str] = None) -> str:
    tm = db.query(TeamMember).filter(TeamMember.user_id == actor_id).first()
    team_id = tm.team_id if tm else None
    from sqlalchemy import or_
    q = db.query(KnowledgeArticle).filter(
        or_(KnowledgeArticle.team_id == team_id, KnowledgeArticle.team_id.is_(None)))
    if query:
        q = q.filter(or_(KnowledgeArticle.title.ilike(f"%{query}%"),
                         KnowledgeArticle.content.ilike(f"%{query}%")))
    arts = q.order_by(KnowledgeArticle.updated_at.desc()).limit(KNOWLEDGE_LIMIT).all()
    if not arts:
        return "Материалы базы знаний по запросу не найдены."
    return "\n".join(f'- {a.title}: {(a.content or "")[:200]}' for a in arts)


# ── контекст для Пита (оперативный, компактный) ───────────────────────────────

def build_pit_context(db: Session, actor_id: int) -> str:
    """Компактный контекст для Пита: команда тимлида (участники + агрегаты) или
    собственные данные участника. Права: тимлид видит только свои команды."""
    actor = db.query(User).filter(User.id == actor_id).first()
    if not actor:
        return "Пользователь не найден."
    header = f"Текущий пользователь: {actor.name} [id:{actor.id}], роль: {'тимлид' if actor.role == 'team_lead' else 'участник'}."
    led = _teams_led(db, actor_id)
    blocks = [header]
    if led:
        for team in led:
            member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team.id).all()]
            blocks.append(f'\nКоманда "{team.name}" [team_id:{team.id}], тимлид [id:{team.team_lead_id}]:')
            for uid in member_ids:
                if uid == actor_id:
                    continue
                blocks.append("  " + _fmt_member(member_facts(db, uid)).replace("\n", "\n  "))
    # Собственные данные (и для тимлида, и для участника).
    blocks.append("\nВаши данные:")
    blocks.append("  " + _fmt_member(member_facts(db, actor_id), self_note=" (текущий пользователь)").replace("\n", "\n  "))
    return "\n".join(blocks)


# ── ONE AI: разделы, права и глубокий контекст ────────────────────────────────

# scope: 'team' — только тимлид; 'self' — свои данные (участник и тимлид);
#        'both' — участник по своим данным, тимлид по команде.
SECTIONS = {
    "team_analysis":         {"scope": "team", "title": "Анализ команды"},
    "employee_analysis":     {"scope": "team", "title": "Анализ сотрудника"},
    "feedback_prep":         {"scope": "team", "title": "Подготовка feedback"},
    "manager_recommendations": {"scope": "team", "title": "Рекомендации руководителю"},
    "one_on_one_prep":       {"scope": "both", "title": "Подготовка к 1-на-1 встрече"},
    "mood_analysis":         {"scope": "both", "title": "Анализ настроения"},
    "goals_analysis":        {"scope": "both", "title": "Анализ целей"},
    "self_analysis":         {"scope": "self", "title": "Анализ личной эффективности"},
    "development_analysis":  {"scope": "both", "title": "Рекомендации по развитию"},
    "knowledge_search":      {"scope": "both", "title": "Поиск по базе знаний"},
    "auto_reports":          {"scope": "team", "title": "Автоматические отчёты"},
}


def available_sections(db: Session, actor_id: int) -> list:
    actor = db.query(User).filter(User.id == actor_id).first()
    is_lead = bool(_teams_led(db, actor_id)) or (actor and actor.role == "team_lead")
    out = []
    for key, cfg in SECTIONS.items():
        if cfg["scope"] == "team" and not is_lead:
            continue
        if cfg["scope"] == "self" and is_lead:
            # личный анализ доступен всем, включая тимлида (его собственные данные)
            pass
        out.append({"key": key, "title": cfg["title"], "scope": cfg["scope"]})
    return out


def build_oneai_context(db: Session, actor_id: int, section: str,
                        target_user_id: Optional[int] = None,
                        team_id: Optional[int] = None,
                        query: Optional[str] = None) -> Tuple[str, dict]:
    """Собрать контекст под раздел ONE AI с проверкой прав. Возвращает
    (context_text, based_on). Бросает 403/400 при нарушении прав ДО вызова LLM."""
    if section not in SECTIONS:
        raise HTTPException(status_code=400, detail="Неизвестный раздел ONE AI")
    cfg = SECTIONS[section]
    actor = db.query(User).filter(User.id == actor_id).first()
    if not actor:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    led = _teams_led(db, actor_id)
    is_lead = bool(led)

    based_on: dict = {"section": section}

    # Разделы уровня команды — только тимлид своей команды.
    if cfg["scope"] == "team":
        if not is_lead:
            raise HTTPException(status_code=403, detail="Раздел доступен только тимлиду")
        team = None
        if team_id is not None:
            if not is_lead_of_team(db, actor_id, team_id):
                raise HTTPException(status_code=403, detail="Нет доступа к этой команде")
            team = db.query(Team).filter(Team.id == team_id).first()
        else:
            team = led[0]
        based_on["team_id"] = team.id

        if section == "employee_analysis" or section == "feedback_prep":
            # анализ конкретного сотрудника команды
            if not target_user_id:
                raise HTTPException(status_code=400, detail="Укажите сотрудника")
            if not member_in_actor_team(db, actor_id, target_user_id):
                raise HTTPException(status_code=403, detail="Сотрудник не в вашей команде")
            f = member_facts(db, target_user_id)
            based_on["target_user_id"] = target_user_id
            based_on["facts"] = {"tasks_total": f["tasks_total"], "meetings_total": f["meetings_total"],
                                 "goals_total": f["goals_total"]}
            ctx = _fmt_member(f, self_note=" (анализируемый сотрудник)")
            return ctx, based_on

        # анализ/рекомендации/отчёты по всей команде
        member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team.id).all()
                      if tm.user_id != team.team_lead_id]
        blocks = [f'Команда "{team.name}" [team_id:{team.id}]. Участников: {len(member_ids)}.']
        for uid in member_ids:
            blocks.append(_fmt_member(member_facts(db, uid)))
        # командные сводки (агрегаты, без выгрузки записей)
        dev = development_analytics.team_summary(db, team.id, team.team_lead_id)
        try:
            mood = mood_service.team_summary(db, team.id)
        except Exception:
            mood = None
        blocks.append(f"Развитие команды (агрегат): {dev}")
        if mood:
            blocks.append(f"Настроение команды (агрегат): среднее {mood.get('avg')}, точек {len(mood.get('points', []))}")
        based_on["members"] = len(member_ids)
        return "\n\n".join(blocks), based_on

    # Разделы уровня сотрудника / both — свои данные (или сотрудник команды для тимлида).
    uid = target_user_id or actor_id
    if uid != actor_id and not member_in_actor_team(db, actor_id, uid):
        # участник не может анализировать чужие данные; тимлид — только свою команду
        raise HTTPException(status_code=403, detail="Нет доступа к данным этого пользователя")
    based_on["target_user_id"] = uid

    if section == "knowledge_search":
        based_on["query"] = query
        return "База знаний:\n" + knowledge_snippets(db, actor_id, query), based_on

    f = member_facts(db, uid)
    based_on["facts"] = {"tasks_total": f["tasks_total"], "meetings_total": f["meetings_total"],
                         "goals_total": f["goals_total"], "mood_avg_30d": f["mood_avg_30d"]}
    ctx = _fmt_member(f, self_note=" (вы)" if uid == actor_id else " (сотрудник)")
    if section in ("goals_analysis", "development_analysis", "self_analysis"):
        ctx += "\n\nБаза знаний (для рекомендаций):\n" + knowledge_snippets(db, actor_id, query)
    return ctx, based_on


# ── системные промпты ────────────────────────────────────────────────────────

ONEAI_SYSTEM = (
    "Ты — ONE AI, стратегический аналитический AI-центр платформы OneOnOne. "
    "В отличие от быстрого ассистента Пита, ты даёшь РАЗВЁРНУТЫЙ аналитический ответ: "
    "выводы, наблюдения и конкретные рекомендации, опираясь ТОЛЬКО на переданные данные. "
    "Ссылайся на конкретику (например: на основе N задач и M встреч за период). "
    "Отвечай на русском, структурировано, без эмодзи. Не выдумывай данные, которых нет в контексте. "
    "Наблюдения о человеке подавай бережно и по делу, без скрытых рейтингов."
)

SECTION_INSTRUCTION = {
    "team_analysis": "Проанализируй состояние команды за последний период: проблемы, риски, вовлечённость. Дай рекомендации руководителю.",
    "employee_analysis": "Проанализируй эффективность и динамику сотрудника. Отметь сильные стороны, зоны роста и что требует внимания.",
    "feedback_prep": "Подготовь структурированный черновик обратной связи для сотрудника на основе его задач, встреч, целей и развития.",
    "manager_recommendations": "Дай практические рекомендации руководителю по управлению командой и улучшению процессов.",
    "one_on_one_prep": "Подготовь к 1-на-1 встрече: темы для обсуждения, вопросы, на что обратить внимание.",
    "mood_analysis": "Проанализируй динамику настроения и вовлечённости. Выдели тревожные сигналы и предложи действия.",
    "goals_analysis": "Проанализируй цели: прогресс, риски срыва, что скорректировать. Помоги с постановкой/декомпозицией.",
    "self_analysis": "Проанализируй личную эффективность: что получается, что западает, как улучшить работу.",
    "development_analysis": "Дай рекомендации по развитию навыков и плану развития на основе разрывов уровней и динамики.",
    "knowledge_search": "Найди и суммируй релевантные материалы базы знаний по запросу, дай практический ответ.",
    "auto_reports": "Сформируй краткий периодический отчёт по команде: ключевые метрики, изменения, на что обратить внимание.",
}
