from datetime import datetime, timedelta
from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models.meeting import Meeting
from app.models.team import TeamMember

class SchedulingService:
    def __init__(self, db: Session):
        self.db = db

    def find_available_slots(
        self,
        team_lead_id: int,
        member_id: int,
        days_ahead: int = 7,
        duration_minutes: int = 30,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Find available slots for a 1-on-1 meeting.
        Simple implementation: propose 2-3 slots on different days
        during working hours (10:00 - 17:00).
        
        In production, this would check Google Calendar availability.
        """
        slots = []
        now = datetime.utcnow()
        start_date = now + timedelta(days=1)  # Start from tomorrow

        # Get existing meetings to avoid conflicts
        existing_meetings = (
            self.db.query(Meeting)
            .filter(
                Meeting.scheduled_date >= start_date,
                Meeting.scheduled_date <= start_date + timedelta(days=days_ahead),
                Meeting.status.in_(["scheduled", "confirmed"]),
            )
            .all()
        )
        busy_times = {m.scheduled_date for m in existing_meetings}

        # Get cadence preference
        member_pref = (
            self.db.query(TeamMember)
            .filter(
                TeamMember.user_id == member_id,
            )
            .first()
        )
        cadence_days = member_pref.cadence_days if member_pref else 7

        # Propose slots
        proposed_dates = set()
        for day_offset in range(1, days_ahead + 1):
            day = start_date + timedelta(days=day_offset)
            # Skip weekends
            if day.weekday() >= 5:
                continue

            # Propose 2 slots per day
            for hour in [10, 14]:  # 10:00 and 14:00
                slot_start = day.replace(hour=hour, minute=0, second=0, microsecond=0)
                slot_end = slot_start + timedelta(minutes=duration_minutes)

                # Simple conflict check
                if slot_start not in busy_times:
                    slots.append((slot_start, slot_end))
                    proposed_dates.add(day.date())

                if len(slots) >= 3:
                    break

            if len(slots) >= 3:
                break

        return slots