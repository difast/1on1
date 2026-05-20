from datetime import datetime, timedelta
from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.models.meeting import Meeting
from app.models.notification import Notification
from app.models.user import User

@celery_app.task
def send_meeting_reminders():
    """
    Send reminders for meetings happening tomorrow.
    """
    db = SessionLocal()
    try:
        tomorrow = datetime.utcnow() + timedelta(days=1)
        tomorrow_start = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_end = tomorrow.replace(hour=23, minute=59, second=59, microsecond=999999)

        meetings = (
            db.query(Meeting)
            .filter(
                Meeting.scheduled_date >= tomorrow_start,
                Meeting.scheduled_date <= tomorrow_end,
                Meeting.status.in_(["scheduled", "confirmed"]),
            )
            .all()
        )

        for meeting in meetings:
            member = db.query(User).filter(User.id == meeting.member_id).first()
            lead = db.query(User).filter(User.id == meeting.team_lead_id).first()

            for user_id, with_name in [
                (meeting.team_lead_id, member.name if member else "team member"),
                (meeting.member_id, lead.name if lead else "team lead"),
            ]:
                notification = Notification(
                    user_id=user_id,
                    type="meeting_reminder",
                    title=f"1-on-1 with {with_name} tomorrow",
                    body=f"Scheduled for {meeting.scheduled_date.strftime('%H:%M')}",
                    data={"meeting_id": meeting.id},
                )
                db.add(notification)

        db.commit()
    finally:
        db.close()


@celery_app.task
def check_overdue_meetings():
    """
    Check for team members who haven't had a 1-on-1 in too long.
    """
    db = SessionLocal()
    try:
        from app.models.team import TeamMember
        from app.services.team_service import TeamService

        service = TeamService(db)
        # Get all unique team IDs
        team_ids = [t[0] for t in db.query(TeamMember.team_id).distinct().all()]

        for team_id in team_ids:
            members = service.get_members_sorted_by_last_meeting(team_id)
            for item in members:
                days = item["days_since_last_meeting"]
                cadence = item["member"].cadence_days
                if days and days > cadence * 2:
                    # Alert team lead
                    team = item["member"].team
                    notification = Notification(
                        user_id=team.team_lead_id,
                        type="overdue_alert",
                        title=f"⚠️ Haven't met with {item['member'].user.name} in {days} days",
                        body=f"Recommended cadence: every {cadence} days",
                        data={"member_id": item["member"].user_id, "team_id": team_id},
                    )
                    db.add(notification)
        db.commit()
    finally:
        db.close()