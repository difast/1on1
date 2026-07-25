"""Совместная работа над задачей (блок 39.2/39.3): лента активности, состав
исполнителей, уведомления. Единый слой, чтобы и роутер задач, и роутер
взаимодействий меняли состав/логировали одинаково, без дублирования.
"""
from sqlalchemy.orm import Session
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_activity import TaskActivity
from app.models.user import User
from app.services.notification_service import NotificationService


def log_activity(db: Session, task_id: int, actor_id: int, action: str, detail: str | None = None):
    db.add(TaskActivity(task_id=task_id, actor_id=actor_id, action=action, detail=detail))


def _name(db: Session, uid: int) -> str:
    u = db.query(User).filter(User.id == uid).first()
    return u.name if u else "Участник"


def ensure_baseline_assignee(db: Session, task: Task):
    """Если у задачи ещё нет строк-исполнителей, но есть assigned_to — заводим
    первую строку, чтобы задача корректно стала совместной при добавлении второго.
    Проверяем через БД (а не через relationship task.assignees), т.к. он может быть
    устаревшим между добавлениями в рамках одной транзакции."""
    count = db.query(TaskAssignee).filter(TaskAssignee.task_id == task.id).count()
    if count == 0 and task.assigned_to:
        db.add(TaskAssignee(task_id=task.id, user_id=task.assigned_to))
        db.flush()


def add_assignee(db: Session, task: Task, user_id: int, actor_id: int,
                 part: str | None = None, notify: bool = True) -> TaskAssignee | None:
    """Добавить исполнителя к задаче (идемпотентно). Логирует активность и шлёт
    уведомление добавленному. Возвращает строку назначения или None, если уже был."""
    ensure_baseline_assignee(db, task)
    existing = db.query(TaskAssignee).filter(
        TaskAssignee.task_id == task.id, TaskAssignee.user_id == user_id
    ).first()
    if existing:
        return None
    row = TaskAssignee(task_id=task.id, user_id=user_id, part_description=part)
    db.add(row)
    db.flush()
    log_activity(db, task.id, actor_id, "assignee_added",
                 f"{_name(db, user_id)} добавлен(а) в исполнители")
    if notify and user_id != actor_id:
        NotificationService(db).create_notification(
            user_id=user_id, type="task_assignee_added",
            title="Вас добавили в задачу",
            body=f"{_name(db, actor_id)}: {task.title}",
            data={"task_id": task.id},
        )
    return row


def remove_assignee(db: Session, task: Task, assignee_id: int, actor_id: int) -> bool:
    row = db.query(TaskAssignee).filter(
        TaskAssignee.id == assignee_id, TaskAssignee.task_id == task.id
    ).first()
    if not row:
        return False
    removed_user = row.user_id
    db.delete(row)
    db.flush()
    log_activity(db, task.id, actor_id, "assignee_removed",
                 f"{_name(db, removed_user)} удалён(а) из исполнителей")
    if removed_user != actor_id:
        NotificationService(db).create_notification(
            user_id=removed_user, type="task_assignee_removed",
            title="Вас удалили из задачи",
            body=f"{task.title}",
            data={"task_id": task.id},
        )
    return True


def notify_task_participants(db: Session, task: Task, title: str, body: str, exclude: set[int] | None = None):
    """Уведомить всех исполнителей задачи (39.2 — значимые изменения)."""
    exclude = exclude or set()
    ids = {a.user_id for a in (task.assignees or [])}
    if task.assigned_to:
        ids.add(task.assigned_to)
    ids -= exclude
    svc = NotificationService(db)
    for uid in ids:
        svc.create_notification(user_id=uid, type="task_update", title=title, body=body,
                                data={"task_id": task.id})
