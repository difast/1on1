"""Синхронизация прогресса между целями и шагами плана развития.

Направление ОДНО: цель -> связанный шаг. Цель является единым источником
истины для прогресса шага, привязанного к ней (development_steps.goal_id).
Правки шага, привязанного к цели, роутер развития делает через обновление
самой цели, после чего снова вызывается sync_steps_from_goal — то есть запись
всегда идёт в один объект (цель), а шаг лишь зеркалит. Циклов нет: эта функция
пишет только в шаги и никогда не трогает цель.
"""
from sqlalchemy.orm import Session


def step_status_for_progress(progress: int, goal_status: str | None = None) -> str:
    if (goal_status == "achieved") or (progress is not None and progress >= 100):
        return "done"
    if progress and progress > 0:
        return "in_progress"
    return "not_started"


def sync_steps_from_goal(db: Session, goal) -> None:
    """Обновить прогресс/статус шагов, привязанных к цели, под саму цель."""
    from app.models.development import DevelopmentStep
    steps = db.query(DevelopmentStep).filter(DevelopmentStep.goal_id == goal.id).all()
    changed = False
    for s in steps:
        if s.status == "cancelled":
            continue  # отменённый шаг не воскрешаем
        np = int(goal.progress or 0)
        ns = step_status_for_progress(np, goal.status)
        if s.progress != np or s.status != ns:
            s.progress = np
            s.status = ns
            changed = True
    if changed:
        db.commit()


def plan_progress(steps) -> int:
    """Прогресс плана из статусов шагов: среднее по активным и завершённым
    (отменённые исключаются). Пустой план — 0."""
    considered = [s for s in steps if s.status != "cancelled"]
    if not considered:
        return 0
    return round(sum(int(s.progress or 0) for s in considered) / len(considered))
