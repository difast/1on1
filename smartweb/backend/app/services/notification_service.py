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

    def _lang(self, user_id: int) -> str:
        """Язык получателя уведомления: то же значение, что в вебе и приложении."""
        user = self.db.query(User).filter(User.id == user_id).first()
        return i18n.user_lang(user) if user else i18n.DEFAULT_LANG

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
        lang = self._lang(member_id)
        return self.create_notification(
            user_id=member_id,
            type="meeting_scheduled",
            title=i18n.t("notify.meetingScheduled.title", lang),
            body=i18n.t("notify.meetingScheduled.body", lang, lead=lead_name, when=when),
            data={"meeting_id": meeting_id},
        )

    def meeting_requested(self, lead_id: int, member_name: str, meeting_id: int):
        lang = self._lang(lead_id)
        return self.create_notification(
            user_id=lead_id,
            type="meeting_request",
            title=i18n.t("notify.meetingRequested.title", lang),
            body=i18n.t("notify.meetingRequested.body", lang, member=member_name),
            data={"meeting_id": meeting_id},
        )

    def meeting_confirmed(self, member_id: int, lead_name: str, meeting_id: int, when: str):
        lang = self._lang(member_id)
        return self.create_notification(
            user_id=member_id,
            type="meeting_confirmed",
            title=i18n.t("notify.meetingConfirmed.title", lang),
            body=i18n.t("notify.meetingConfirmed.body", lang, lead=lead_name, when=when),
            data={"meeting_id": meeting_id},
        )

    def meeting_declined(self, member_id: int, lead_name: str, meeting_id: int):
        lang = self._lang(member_id)
        return self.create_notification(
            user_id=member_id,
            type="meeting_declined",
            title=i18n.t("notify.meetingDeclined.title", lang),
            body=i18n.t("notify.meetingDeclined.body", lang, lead=lead_name),
            data={"meeting_id": meeting_id},
        )

    def meeting_reminder(self, user_id: int, meeting_id: int, with_name: str, when: str):
        lang = self._lang(user_id)
        return self.create_notification(
            user_id=user_id,
            type="meeting_reminder",
            title=i18n.t("notify.meetingReminder.title", lang),
            body=i18n.t("notify.meetingReminder.body", lang, name=with_name, when=when),
            data={"meeting_id": meeting_id},
        )

    def meeting_request(self, user_id: int, from_name: str, meeting_id: int):
        lang = self._lang(user_id)
        return self.create_notification(
            user_id=user_id,
            type="meeting_request",
            title=i18n.t("notify.meetingRequest.title", lang, name=from_name),
            body=i18n.t("notify.meetingRequest.body", lang),
            data={"meeting_id": meeting_id},
        )

    def call_started(self, user_id: int, caller_name: str, room_url: str):
        lang = self._lang(user_id)
        return self.create_notification(
            user_id=user_id,
            type="call_started",
            title=i18n.t("notify.callStarted.title", lang, name=caller_name),
            body=i18n.t("notify.callStarted.body", lang),
            data={"room_url": room_url},
        )

    def task_assigned(self, user_id: int, task_id: int, task_title: str, assigner_name: str):
        lang = self._lang(user_id)
        return self.create_notification(
            user_id=user_id,
            type="new_task",
            title=i18n.t("notify.taskAssigned.title", lang),
            body=i18n.t("notify.taskAssigned.body", lang, assigner=assigner_name, task=task_title),
            data={"task_id": task_id},
        )

    def burnout_alert(self, user_id: int, member_name: str, reschedule_count: int):
        lang = self._lang(user_id)
        return self.create_notification(
            user_id=user_id,
            type="burnout_alert",
            title=i18n.t("notify.burnout.title", lang, name=member_name, count=reschedule_count),
            body=i18n.t("notify.burnout.body", lang),
        )
