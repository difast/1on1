import httpx
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.user import User

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _send_expo_push(token: str, title: str, body: str, data: dict = None):
    if not token or not token.startswith("ExponentPushToken["):
        return
    payload = {"to": token, "title": title, "body": body, "sound": "default"}
    if data:
        payload["data"] = data
    try:
        with httpx.Client(timeout=8) as client:
            client.post(EXPO_PUSH_URL, json=payload, headers={"Content-Type": "application/json"})
    except Exception:
        pass


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def _get_push_token(self, user_id: int) -> str | None:
        user = self.db.query(User).filter(User.id == user_id).first()
        return user.push_token if user else None

    def create_notification(
        self,
        user_id: int,
        type: str,
        title: str,
        body: str = None,
        data: dict = None,
    ):
        notif = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            data=data,
        )
        self.db.add(notif)
        self.db.commit()
        token = self._get_push_token(user_id)
        if token:
            _send_expo_push(token, title, body or "", data)
        # Дублируем в Telegram-бот всем, у кого привязан аккаунт (единый канал
        # уведомлений). Ошибка отправки не влияет на создание уведомления.
        try:
            from app.services.telegram import notify_user
            notify_user(self.db, user_id, title, body)
        except Exception:
            pass
        return notif

    def meeting_scheduled(self, member_id: int, meeting_id: int, lead_name: str, when: str):
        return self.create_notification(
            user_id=member_id,
            type="meeting_scheduled",
            title="Встреча запланирована",
            body=f"{lead_name} назначил встречу на {when}",
            data={"meeting_id": meeting_id},
        )

    def meeting_requested(self, lead_id: int, member_name: str, meeting_id: int):
        return self.create_notification(
            user_id=lead_id,
            type="meeting_request",
            title="Запрос на встречу",
            body=f"{member_name} хочет провести 1-on-1",
            data={"meeting_id": meeting_id},
        )

    def meeting_confirmed(self, member_id: int, lead_name: str, meeting_id: int, when: str):
        return self.create_notification(
            user_id=member_id,
            type="meeting_confirmed",
            title="Встреча подтверждена",
            body=f"{lead_name} подтвердил встречу на {when}",
            data={"meeting_id": meeting_id},
        )

    def meeting_declined(self, member_id: int, lead_name: str, meeting_id: int):
        return self.create_notification(
            user_id=member_id,
            type="meeting_declined",
            title="Встреча отклонена",
            body=f"{lead_name} отклонил запрос на встречу",
            data={"meeting_id": meeting_id},
        )

    def meeting_reminder(self, user_id: int, meeting_id: int, with_name: str, when: str):
        return self.create_notification(
            user_id=user_id,
            type="meeting_reminder",
            title="Напоминание о встрече",
            body=f"Встреча с {with_name} в {when}",
            data={"meeting_id": meeting_id},
        )

    def meeting_request(self, user_id: int, from_name: str, meeting_id: int):
        return self.create_notification(
            user_id=user_id,
            type="meeting_request",
            title=f"Запрос на встречу от {from_name}",
            body="Нажмите, чтобы подтвердить или отклонить",
            data={"meeting_id": meeting_id},
        )

    def call_started(self, user_id: int, caller_name: str, room_url: str):
        return self.create_notification(
            user_id=user_id,
            type="call_started",
            title=f"📹 {caller_name} начал созвон",
            body="Нажмите «Присоединиться» чтобы войти",
            data={"room_url": room_url},
        )

    def task_assigned(self, user_id: int, task_id: int, task_title: str, assigner_name: str):
        return self.create_notification(
            user_id=user_id,
            type="new_task",
            title="Новая задача",
            body=f"{assigner_name}: {task_title}",
            data={"task_id": task_id},
        )

    def burnout_alert(self, user_id: int, member_name: str, reschedule_count: int):
        return self.create_notification(
            user_id=user_id,
            type="burnout_alert",
            title=f"⚠️ {member_name} перенёс встречу {reschedule_count} раз",
            body="Рассмотрите возможность личного общения",
        )
