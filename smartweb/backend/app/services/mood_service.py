"""Настроение: часовые пояса, анонимные командные агрегаты и личные ряды.

Единый слой для роутера настроения, аналитики и планировщика сводки 10:00 —
чтобы правило анонимности и подсчёты были в одном месте, без дублирования.

Правило анонимности (13.5): если за день заполнили меньше порога человек, наружу
статистика не отдаётся — только признак недостаточности данных. Порог берётся из
конфигурации (settings.mood_anon_threshold), по умолчанию 3.
"""
from datetime import datetime, timedelta, date
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.models.mood import MoodEntry
from app.models.team import Team, TeamMember


def team_tz(db: Session, team_id: int) -> ZoneInfo:
    team = db.query(Team).filter(Team.id == team_id).first()
    name = (team.timezone if team and team.timezone else settings.default_timezone) or "UTC"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("UTC")


def local_date(dt_utc: datetime, tz: ZoneInfo) -> date:
    """Локальная дата (в поясе команды) для UTC-времени записи."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=ZoneInfo("UTC"))
    return dt_utc.astimezone(tz).date()


def now_local(tz: ZoneInfo) -> datetime:
    return datetime.now(ZoneInfo("UTC")).astimezone(tz)


def expected_size(db: Session, team_id: int) -> int:
    """Сколько человек ожидаемо заполняют опрос (участники команды, кроме лида)."""
    return db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.role != "lead"
    ).count()


def _threshold() -> int:
    return max(1, int(settings.mood_anon_threshold or 3))


def _agg(scores: list[int]):
    if not scores:
        return None, {str(i): 0 for i in range(1, 6)}
    dist = {str(i): 0 for i in range(1, 6)}
    for s in scores:
        b = max(1, min(5, int(s)))
        dist[str(b)] += 1
    return round(sum(scores) / len(scores), 2), dist


def team_summary(db: Session, team_id: int, ref: date | None = None) -> dict:
    """Анонимная командная сводка настроения (13.3): средний уровень,
    распределение, динамика к предыдущему дню, доля заполнивших + ряды за 7 дней
    и 12 недель. Дни с числом заполнивших ниже порога отдаются как разрыв (avg
    = null) — анонимность соблюдается и в исторических точках."""
    tz = team_tz(db, team_id)
    threshold = _threshold()
    today = ref or now_local(tz).date()
    yesterday = today - timedelta(days=1)

    window_start_utc = datetime.now(ZoneInfo("UTC")) - timedelta(weeks=13)
    entries = db.query(MoodEntry).filter(
        MoodEntry.team_id == team_id,
        MoodEntry.created_at >= window_start_utc,
    ).all()

    # Группируем по локальной дате: список (user_id, score). Дедуп на всякий
    # случай — одна запись на пользователя в день (последняя).
    by_day: dict[date, dict] = defaultdict(dict)
    anon_counter = 0
    for e in entries:
        d = local_date(e.created_at, tz)
        key = e.user_id if e.user_id is not None else f"anon-{e.id}"
        by_day[d][key] = e.score

    def day_scores(d: date) -> list[int]:
        return list(by_day.get(d, {}).values())

    size = expected_size(db, team_id)

    def point(d: date):
        scores = day_scores(d)
        filled = len(scores)
        if filled < threshold:
            return {"avg": None, "count": filled, "insufficient": True}
        avg, _ = _agg(scores)
        return {"avg": avg, "count": filled, "insufficient": False}

    today_scores = day_scores(today)
    filled_today = len(today_scores)
    insufficient = filled_today < threshold

    result = {
        "date": today.isoformat(),
        "threshold": threshold,
        "filled": filled_today,
        "team_size": size,
        "share_pct": round(filled_today / size * 100) if size else None,
        "insufficient": insufficient,
    }
    if insufficient:
        # Никакой статистики — только признак недостаточности данных.
        result["message"] = f"Недостаточно данных для анонимной статистики (нужно от {threshold} ответов, есть {filled_today})."
        result["avg"] = None
        result["distribution"] = None
        result["delta_prev"] = None
    else:
        avg, dist = _agg(today_scores)
        y = point(yesterday)
        result["avg"] = avg
        result["distribution"] = dist
        result["delta_prev"] = round(avg - y["avg"], 2) if y["avg"] is not None else None

    # Ряды (для графиков на вебе): дни с count<threshold -> avg null (разрыв).
    days = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        p = point(d)
        days.append({"day": d.strftime("%d.%m"), "date": d.isoformat(), **p})

    # Недели: агрегируем по ISO-неделе, порог применяем к числу заполнивших/неделю.
    by_week: dict[tuple, list[int]] = defaultdict(list)
    for d, users in by_day.items():
        iso = d.isocalendar()
        by_week[(iso[0], iso[1])].extend(users.values())
    weeks = []
    for i in range(11, -1, -1):
        wd = today - timedelta(weeks=i)
        iso = wd.isocalendar()
        scores = by_week.get((iso[0], iso[1]), [])
        if len(scores) < threshold:
            weeks.append({"week": wd.strftime("W%V"), "avg": None, "count": len(scores), "insufficient": True})
        else:
            avg, _ = _agg(scores)
            weeks.append({"week": wd.strftime("W%V"), "avg": avg, "count": len(scores), "insufficient": False})

    result["days"] = days
    result["weeks"] = weeks
    return result


def user_series(db: Session, user_id: int, tz: ZoneInfo, start: date, end: date) -> list[dict]:
    """Личный ряд настроения пользователя (27.1): одна точка на локальный день,
    пропущенные дни НЕ заполняются нулями — их просто нет (разрыв на графике)."""
    start_utc = datetime.now(ZoneInfo("UTC")) - timedelta(days=(date.today() - start).days + 2)
    rows = db.query(MoodEntry).filter(
        MoodEntry.user_id == user_id,
        MoodEntry.created_at >= start_utc,
    ).order_by(MoodEntry.created_at.asc()).all()
    by_day: dict[date, int] = {}
    for e in rows:
        d = local_date(e.created_at, tz)
        if start <= d <= end:
            by_day[d] = e.score  # последняя за день
    return [{"date": d.isoformat(), "day": d.strftime("%d.%m"), "score": by_day[d]} for d in sorted(by_day)]
