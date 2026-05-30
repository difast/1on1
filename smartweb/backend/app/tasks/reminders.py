from datetime import datetime, timedelta
from sqlalchemy import func as sqlfunc
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

        all_user_ids = {uid for m in meetings for uid in (m.member_id, m.team_lead_id) if uid}
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(all_user_ids)).all()} if all_user_ids else {}

        messages = []
        for meeting in meetings:
            member = users_map.get(meeting.member_id)
            lead = users_map.get(meeting.team_lead_id)
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

        all_user_ids = {uid for m in meetings for uid in (m.member_id, m.team_lead_id) if uid}
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(all_user_ids)).all()} if all_user_ids else {}

        messages = []
        for meeting in meetings:
            member = users_map.get(meeting.member_id)
            lead = users_map.get(meeting.team_lead_id)

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

        team_members = db.query(TeamMember).filter(
            TeamMember.cadence_days > 0,
            TeamMember.role != "lead",
        ).all()

        if not team_members:
            return

        # Batch-load last meeting date per (member_id, team_id)
        member_team_pairs = [(tm.user_id, tm.team_id) for tm in team_members]
        member_ids = list({tm.user_id for tm in team_members})
        team_ids = list({tm.team_id for tm in team_members})

        last_meeting_rows = (
            db.query(Meeting.member_id, Meeting.team_id, sqlfunc.max(Meeting.scheduled_date).label("last_date"))
            .filter(
                Meeting.member_id.in_(member_ids),
                Meeting.team_id.in_(team_ids),
                Meeting.status.notin_(["cancelled", "declined"]),
            )
            .group_by(Meeting.member_id, Meeting.team_id)
            .all()
        )
        last_meeting_map = {(row.member_id, row.team_id): row.last_date for row in last_meeting_rows}

        # Batch-load all relevant users and teams
        all_user_ids = set(member_ids)
        teams_map = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}
        lead_ids = {t.team_lead_id for t in teams_map.values() if t.team_lead_id}
        all_user_ids |= lead_ids
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(all_user_ids)).all()}

        now = datetime.utcnow()
        messages = []
        for tm in team_members:
            last_date = last_meeting_map.get((tm.user_id, tm.team_id))
            days = (now - last_date).days if last_date else 9999

            if days > tm.cadence_days * 2:
                team = teams_map.get(tm.team_id)
                if not team:
                    continue
                member = users_map.get(tm.user_id)
                lead = users_map.get(team.team_lead_id)
                member_name = member.name if member else "—"

                db.add(Notification(
                    user_id=team.team_lead_id,
                    type="overdue_alert",
                    title=f"Давно не было 1-on-1 с {member_name}",
                    body=f"Прошло {days} дн., рекомендуется каждые {tm.cadence_days} дн.",
                    data={"member_id": tm.user_id, "team_id": tm.team_id},
                ))
                if lead and lead.push_token:
                    messages.append({
                        "to": lead.push_token,
                        "title": f"Давно не было 1-on-1 с {member_name}",
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
