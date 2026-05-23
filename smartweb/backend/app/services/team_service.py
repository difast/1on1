from sqlalchemy.orm import Session
from typing import List
from app.models.team import Team, TeamMember
from app.models.meeting import Meeting
from datetime import datetime

class TeamService:
    def __init__(self, db: Session):
        self.db = db

    def get_members_sorted_by_last_meeting(self, team_id: int) -> List[dict]:
        """
        Returns team members sorted by how long ago their last meeting was.
        Those who haven't been met recently come first.
        """
        members = (
            self.db.query(TeamMember)
            .filter(TeamMember.team_id == team_id)
            .all()
        )

        result = []
        for member in members:
            last_meeting = (
                self.db.query(Meeting)
                .filter(
                    Meeting.member_id == member.user_id,
                    Meeting.team_id == team_id,
                )
                .order_by(Meeting.scheduled_date.desc())
                .first()
            )
            days_since = None
            if last_meeting:
                days_since = (datetime.utcnow() - last_meeting.scheduled_date).days

            result.append({
                "member": member,
                "days_since_last_meeting": days_since,
                "last_meeting": last_meeting,
            })

        # Sort: None (never met) first, then by days descending
        result.sort(
            key=lambda x: (
                x["days_since_last_meeting"] is not None,
                -(x["days_since_last_meeting"] or 0),
            )
        )
        return result

    def get_color_status(self, days_since: int | None, cadence_days: int) -> str:
        if days_since is None:
            return "red"  # Never met
        if days_since > cadence_days * 2:
            return "red"
        if days_since > cadence_days:
            return "yellow"
        return "green"