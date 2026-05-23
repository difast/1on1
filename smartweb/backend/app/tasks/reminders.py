from datetime import datetime, timedelta
from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models.meeting import Meeting
from app.models.notification import Notification
from app.models.user import User
from app.utils.push import send_push, send_push_bulk


@celery_app.task
def send_meeting_reminders():
    """Daily reminder for meetings tomorrow."""
    db = SessionLocal()
    try:
        tomorrow = datetime.utcnow() + timedelta(days=1)
        start = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
        end = tomorrow.replace(hour=23, minute=59, second=59, microsecond=999999)

        meetings = (
            db.query(Meeting)
            .filter(
                Meeting.scheduled_date >= start,
                Meeting.scheduled_date <= end,
                Meeting.status.in_(["scheduled", "confirmed"]),
            )
            .all()
        )

        messages = []
        for meeting in meetings:
            member = db.query(User).filter(User.id == meeting.member_id).first()
            lead = db.query(User).filter(User.id == meeting.team_lead_id).first()
            time_str = meeting.scheduled_date.strftime("%H:%M")

            for user, with_name in [(lead, member.name if member else "—"), (member, lead.name if lead else "—")]:
                if not user:
                    continue
                db.add(Notification(
                    user_id=user.id,
                    type="meeting_reminder",
                    title=f"1-on-1 с {with_name} завтра",
                    body=f"Запланировано на {time_str}",
                    data={"meeting_id": meeting.id},
                ))
                if user.push_token:
                    messages.append({
                        "to": user.push_token,
                        "title": f"1-on-1 с {with_name} завтра",
                        "body": f"Запланировано на {time_str}",
                        "sound": "default",
                        "data": {"meeting_id": meeting.id},
                    })

        db.commit()
        send_push_bulk(messages)
    finally:
        db.close()


@celery_app.task
def send_hourly_meeting_reminders():
    """Send push when meeting starts in ~1 hour."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        window_start = now + timedelta(minutes=55)
        window_end = now + timedelta(minutes=65)

        meetings = (
            db.query(Meeting)
            .filter(
                Meeting.scheduled_date >= window_start,
                Meeting.scheduled_date <= window_end,
                Meeting.status.in_(["scheduled", "confirmed"]),
            )
            .all()
        )

        messages = []
        for meeting in meetings:
            member = db.query(User).filter(User.id == meeting.member_id).first()
            lead = db.query(User).filter(User.id == meeting.team_lead_id).first()

            for user, with_name in [(lead, member.name if member else "—"), (member, lead.name if lead else "—")]:
                if user and user.push_token:
                    messages.append({
                        "to": user.push_token,
                        "title": "Встреча через час",
                        "body": f"1-on-1 с {with_name}",
                        "sound": "default",
                        "priority": "high",
                        "data": {"meeting_id": meeting.id},
                    })

        send_push_bulk(messages)
    finally:
        db.close()


@celery_app.task
def check_overdue_meetings():
    """Check for members who haven't had a 1-on-1 in too long."""
    db = SessionLocal()
    try:
        from app.models.team import TeamMember, Team

        overdue = (
            db.query(TeamMember)
            .all()
        )

        messages = []
        for tm in overdue:
            last = (
                db.query(Meeting)
                .filter(
                    Meeting.member_id == tm.user_id,
                    Meeting.team_id == tm.team_id,
                    Meeting.status.notin_(["cancelled", "declined"]),
                )
                .order_by(Meeting.scheduled_date.desc())
                .first()
            )
            if last:
                days = (datetime.utcnow() - last.scheduled_date).days
            else:
                days = 9999

            if days > tm.cadence_days * 2:
                member = db.query(User).filter(User.id == tm.user_id).first()
                team = db.query(Team).filter(Team.id == tm.team_id).first()
                if not team:
                    continue
                lead = db.query(User).filter(User.id == team.team_lead_id).first()

                db.add(Notification(
                    user_id=team.team_lead_id,
                    type="overdue_alert",
                    title=f"Давно не было 1-on-1 с {member.name if member else '—'}",
                    body=f"Прошло {days} дн., рекомендуется каждые {tm.cadence_days} дн.",
                    data={"member_id": tm.user_id, "team_id": tm.team_id},
                ))
                if lead and lead.push_token:
                    messages.append({
                        "to": lead.push_token,
                        "title": f"Давно не было 1-on-1 с {member.name if member else '—'}",
                        "body": f"Прошло {days} дн., рекомендуется каждые {tm.cadence_days} дн.",
                        "sound": "default",
                        "data": {"member_id": tm.user_id, "team_id": tm.team_id},
                    })

        db.commit()
        send_push_bulk(messages)
    finally:
        db.close()


@celery_app.task
def send_new_task_notification(user_id: int, task_title: str, assigned_by_name: str, task_id: int):
    """Called immediately when a task is assigned."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        db.add(Notification(
            user_id=user_id,
            type="new_task",
            title="Новая задача",
            body=f"{assigned_by_name}: {task_title}",
            data={"task_id": task_id},
        ))
        db.commit()
        if user.push_token:
            send_push(
                user.push_token,
                "Новая задача",
                f"{assigned_by_name}: {task_title}",
                {"task_id": task_id},
            )
    finally:
        db.close()
