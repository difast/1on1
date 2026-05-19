from sqlalchemy.orm import Session
from app.models.notification import Notification

class NotificationService:
    def __init__(self, db: Session):
        self.db = db

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
        return notif

    def meeting_reminder(self, user_id: int, meeting_id: int, with_name: str, when: str):
        return self.create_notification(
            user_id=user_id,
            type="meeting_reminder",
            title=f"1-on-1 with {with_name} tomorrow",
            body=f"Scheduled for {when}",
            data={"meeting_id": meeting_id},
        )

    def meeting_request(self, user_id: int, from_name: str, meeting_id: int):
        return self.create_notification(
            user_id=user_id,
            type="meeting_request",
            title=f"Meeting request from {from_name}",
            body="Tap to confirm or decline",
            data={"meeting_id": meeting_id},
        )

    def burnout_alert(self, user_id: int, member_name: str, reschedule_count: int):
        return self.create_notification(
            user_id=user_id,
            type="burnout_alert",
            title=f"⚠️ {member_name} has rescheduled {reschedule_count} times",
            body="Consider reaching out personally",
        )