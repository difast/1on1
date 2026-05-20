from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import defaultdict

from app.database import get_db
from app.models import Meeting, Task, Team, TeamMember, User

router = APIRouter()

MOOD_ORDER = {"great": 4, "good": 3, "neutral": 2, "bad": 1}
MOOD_EMOJI = {"great": "😊", "good": "🙂", "neutral": "😐", "bad": "😔"}


def _member_stats(user_id: int, user_name: str, role: str, meetings: list, tasks: list, now: datetime):
    sorted_mtgs = sorted(meetings, key=lambda m: m.scheduled_date, reverse=True)
    thirty_ago = now - timedelta(days=30)
    ninety_ago = now - timedelta(days=90)

    meetings_30 = sum(1 for m in sorted_mtgs if m.scheduled_date >= thirty_ago)
    meetings_90 = sum(1 for m in sorted_mtgs if m.scheduled_date >= ninety_ago)

    days_since = None
    if sorted_mtgs:
        days_since = max((now - sorted_mtgs[0].scheduled_date).days, 0)

    avg_interval = None
    if len(sorted_mtgs) >= 2:
        gaps = [(sorted_mtgs[i].scheduled_date - sorted_mtgs[i + 1].scheduled_date).days
                for i in range(len(sorted_mtgs) - 1)]
        avg_interval = round(sum(abs(g) for g in gaps) / len(gaps), 1)

    total_t = len(tasks)
    done_t = sum(1 for t in tasks if t.completed)
    open_t = total_t - done_t
    task_pct = round(done_t / total_t * 100) if total_t else None

    mood_seq = [m.mood for m in sorted_mtgs[:6] if m.mood]

    flags = []
    if days_since is None or days_since >= 14:
        flags.append("no_meeting_14_days")
    moods_val = [MOOD_ORDER.get(m, 0) for m in mood_seq[:3]]
    if len(moods_val) == 3 and moods_val[0] < moods_val[1] < moods_val[2]:
        # newest mood is worst (list is desc) → deteriorating
        flags.append("mood_declining")
    if open_t >= 5:
        flags.append("many_incomplete_tasks")

    return {
        "user_id": user_id,
        "name": user_name,
        "role": role,
        "meetings_last_30": meetings_30,
        "meetings_last_90": meetings_90,
        "total_meetings": len(meetings),
        "avg_interval_days": avg_interval,
        "days_since_last": days_since,
        "task_completion_pct": task_pct,
        "open_tasks": open_t,
        "completed_tasks": done_t,
        "total_tasks": total_t,
        "mood_trend": [{"mood": m, "emoji": MOOD_EMOJI.get(m, "❓")} for m in mood_seq],
        "warning_flags": flags,
    }


def _weeks_chart(meetings: list, now: datetime, n: int = 12):
    result = []
    for i in range(n - 1, -1, -1):
        week_start = now - timedelta(weeks=i + 1)
        week_end = now - timedelta(weeks=i)
        iso = week_start.isocalendar()
        label = f"W{iso[1]:02d}"
        count = sum(1 for m in meetings if week_start <= m.scheduled_date < week_end)
        result.append({"week": label, "count": count})
    return result


@router.get("/lead/{user_id}")
def get_lead_analytics(user_id: int, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    teams = db.query(Team).filter(Team.team_lead_id == user_id).all()

    teams_result = []
    for team in teams:
        team_meetings = db.query(Meeting).filter(
            Meeting.team_id == team.id,
            Meeting.status.notin_(["cancelled"]),
            Meeting.scheduled_date <= now,
        ).all()

        members_rows = db.query(TeamMember).filter(TeamMember.team_id == team.id).all()
        member_stats_list = []

        for tm in members_rows:
            user = db.query(User).filter(User.id == tm.user_id).first()
            if not user:
                continue
            m_meetings = [m for m in team_meetings if m.member_id == tm.user_id]
            m_tasks = db.query(Task).filter(
                Task.assigned_to == tm.user_id,
                Task.team_id == team.id,
            ).all()
            member_stats_list.append(
                _member_stats(tm.user_id, user.name, tm.role or "member", m_meetings, m_tasks, now)
            )

        # Team-level average interval
        intervals = [s["avg_interval_days"] for s in member_stats_list if s["avg_interval_days"]]
        team_avg = round(sum(intervals) / len(intervals), 1) if intervals else None

        # Top 3 / at-risk
        by_90 = sorted(member_stats_list, key=lambda s: s["meetings_last_90"], reverse=True)
        top3 = by_90[:3]
        at_risk = sorted(
            [s for s in member_stats_list if "no_meeting_14_days" in s["warning_flags"]],
            key=lambda s: s["days_since_last"] if s["days_since_last"] is not None else 9999,
            reverse=True,
        )

        # Warning signals list
        signals = []
        for s in member_stats_list:
            for flag in s["warning_flags"]:
                sig = {"type": flag, "member_id": s["user_id"], "member_name": s["name"]}
                if flag == "no_meeting_14_days":
                    sig["days"] = s["days_since_last"]
                elif flag == "many_incomplete_tasks":
                    sig["count"] = s["open_tasks"]
                signals.append(sig)

        # Hour distribution
        hour_dist = defaultdict(int)
        for m in team_meetings:
            hour_dist[str(m.scheduled_date.hour)] += 1

        # Role averages (90d)
        role_map = defaultdict(list)
        for s in member_stats_list:
            role_map[s["role"]].append(s["meetings_last_90"])
        role_avg = {r: round(sum(v) / len(v), 1) for r, v in role_map.items()}

        teams_result.append({
            "team_id": team.id,
            "team_name": team.name,
            "total_meetings": len(team_meetings),
            "avg_interval_days": team_avg,
            "meetings_per_week": _weeks_chart(team_meetings, now),
            "top_members": top3,
            "at_risk_members": at_risk,
            "member_stats": member_stats_list,
            "warning_signals": signals,
            "patterns": {
                "hour_distribution": dict(hour_dist),
                "role_avg_meetings_90d": role_avg,
            },
        })

    return {"teams": teams_result}


@router.get("/member/{user_id}")
def get_member_analytics(user_id: int, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    ninety_ago = now - timedelta(days=90)
    thirty_ago = now - timedelta(days=30)

    meetings = db.query(Meeting).filter(
        Meeting.member_id == user_id,
        Meeting.status.notin_(["cancelled"]),
        Meeting.scheduled_date <= now,
    ).order_by(Meeting.scheduled_date.desc()).all()

    meetings_90 = [m for m in meetings if m.scheduled_date >= ninety_ago]

    # Lead-initiated = scheduled/confirmed/completed; member-initiated = was requested
    # We detect member-initiated by original status — no perfect signal, use "requested" meetings
    # as proxy if they still carry that status, otherwise treat scheduled as lead-initiated
    lead_init = sum(1 for m in meetings_90 if m.status in ("scheduled", "confirmed", "completed"))
    member_init = sum(1 for m in meetings_90 if m.status == "requested")

    days_since = None
    if meetings:
        days_since = max((now - meetings[0].scheduled_date).days, 0)

    mood_trend = [
        {"date": m.scheduled_date.strftime("%d.%m"), "mood": m.mood, "emoji": MOOD_EMOJI.get(m.mood, "❓")}
        for m in reversed(meetings[:8]) if m.mood
    ]

    all_tasks = db.query(Task).filter(Task.assigned_to == user_id).all()
    done_t = sum(1 for t in all_tasks if t.completed)
    open_t = len(all_tasks) - done_t
    task_pct = round(done_t / len(all_tasks) * 100) if all_tasks else None

    closed_30 = sum(
        1 for t in all_tasks
        if t.completed and t.completed_at and t.completed_at >= thirty_ago
    )

    return {
        "meetings_last_90": len(meetings_90),
        "total_meetings": len(meetings),
        "lead_initiated": lead_init,
        "member_initiated": member_init,
        "days_since_last": days_since,
        "task_completion_pct": task_pct,
        "open_tasks": open_t,
        "completed_tasks": done_t,
        "closed_last_30": closed_30,
        "mood_trend": mood_trend,
        "meetings_per_week": _weeks_chart(meetings, now),
    }
