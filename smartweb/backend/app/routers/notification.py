from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationOut, NotificationCount

router = APIRouter()

@router.get("/", response_model=List[NotificationOut])
def list_notifications(
    user_id: int = Query(...),
    unread_only: bool = Query(False),
    limit: int = Query(50),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.read == False)
    return query.order_by(Notification.created_at.desc()).limit(limit).all()

@router.get("/count", response_model=NotificationCount)
def unread_count(user_id: int = Query(...), db: Session = Depends(get_db)):
    count = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False,
    ).count()
    return NotificationCount(unread_count=count)

@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if notif:
        notif.read = True
        db.commit()
    return {"ok": True}

@router.post("/read-all")
def mark_all_read(user_id: int = Query(...), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False,
    ).update({"read": True})
    db.commit()
    return {"ok": True}


class BroadcastBody(BaseModel):
    title: str
    body: Optional[str] = None
    target: str = "all"   # "all" | user_id (str of int)

@router.post("/broadcast")
def broadcast(data: BroadcastBody, db: Session = Depends(get_db)):
    if data.target == "all":
        users = db.query(User).filter(User.is_blocked == False).all()
    else:
        try:
            uid = int(data.target)
        except ValueError:
            return {"ok": False, "error": "invalid target"}
        users = db.query(User).filter(User.id == uid).all()

    created = 0
    for u in users:
        notif = Notification(
            user_id=u.id,
            type="broadcast",
            title=data.title,
            body=data.body,
            is_broadcast=True,
            read=False,
        )
        db.add(notif)
        created += 1
    db.commit()

    # Also deliver as a system push (same as in-app notifications)
    try:
        from app.utils.push import send_push_bulk
        messages = [
            {
                "to": u.push_token,
                "title": data.title,
                "body": data.body or "",
                "sound": "default",
                "priority": "high",
                "data": {"type": "broadcast"},
            }
            for u in users
            if u.push_token and str(u.push_token).startswith("ExponentPushToken")
        ]
        if messages:
            send_push_bulk(messages)
    except Exception:
        pass

    # Рассылка в Telegram-бот всем, у кого привязан аккаунт. Оформляем как
    # объявление: жирный заголовок-плашка, жирный заголовок рассылки и выделенный
    # текст. Пользовательский текст экранируем (parse_mode=HTML).
    try:
        import html
        from app.services.telegram import send_message as tg_send
        title = html.escape((data.title or "").strip())
        body = html.escape((data.body or "").strip())
        parts = ["<b>Важное объявление</b>"]
        if title:
            parts.append(f"<b>{title}</b>")
        if body:
            parts.append(f"<i>{body}</i>")
        text = "\n\n".join(parts)
        for u in users:
            if u.telegram_id:
                tg_send(u.telegram_id, text, parse_mode="HTML")
    except Exception:
        pass

    return {"ok": True, "sent": created}
