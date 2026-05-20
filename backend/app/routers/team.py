import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.team import Team, TeamMember
from app.models.user import User
from app.models.meeting import Meeting
from app.schemas.team import TeamCreate, TeamOut, TeamDetailOut, TeamMemberOut, JoinByCode

router = APIRouter()

def generate_invite_code():
    return secrets.token_urlsafe(8)

@router.post("/", response_model=TeamOut)
def create_team(data: TeamCreate, db: Session = Depends(get_db)):
    team_lead = db.query(User).filter(User.id == data.team_lead_id).first()
    if not team_lead:
        raise HTTPException(status_code=404, detail="Team lead not found")

    team = Team(
        name=data.name,
        invite_code=generate_invite_code(),
        team_lead_id=data.team_lead_id,
    )
    db.add(team)
    db.flush()

    # Add team lead as member
    member = TeamMember(
        team_id=team.id,
        user_id=data.team_lead_id,
        role="lead",
        cadence_days=14,
    )
    db.add(member)
    db.commit()
    db.refresh(team)
    return team

@router.get("/", response_model=List[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    return db.query(Team).all()

@router.get("/{team_id}", response_model=TeamDetailOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Build member list with status
    members_out = []
    from datetime import datetime, timedelta
    for tm in team.members:
        user = db.query(User).filter(User.id == tm.user_id).first()
        last_meeting = (
            db.query(Meeting)
            .filter(
                Meeting.member_id == tm.user_id,
                Meeting.team_id == team_id,
                Meeting.status != 'cancelled',
                Meeting.scheduled_date <= datetime.utcnow(),
            )
            .order_by(Meeting.scheduled_date.desc())
            .first()
        )
        color = "green"
        if last_meeting:
            days_since = (datetime.utcnow() - last_meeting.scheduled_date).days
            if days_since > tm.cadence_days * 2:
                color = "red"
            elif days_since > tm.cadence_days:
                color = "yellow"
        else:
            color = "red"

        members_out.append(TeamMemberOut(
            id=tm.id,
            user_id=tm.user_id,
            user_name=user.name if user else "Unknown",
            user_email=user.email if user else "",
            user_title=user.title if user else None,
            user_avatar_url=user.avatar if user else None,
            telegram=user.telegram if user else None,
            linkedin=user.linkedin if user else None,
            github=user.github if user else None,
            role=tm.role,
            cadence_days=tm.cadence_days,
            last_meeting_date=last_meeting.scheduled_date if last_meeting else None,
            status_color=color,
            is_registered=user is not None,
        ))

    return TeamDetailOut(
        id=team.id,
        name=team.name,
        invite_code=team.invite_code,
        team_lead_id=team.team_lead_id,
        created_at=team.created_at,
        members=members_out,
    )

@router.post("/join", response_model=TeamMemberOut)
def join_team(data: JoinByCode, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.invite_code == data.invite_code).first()
    if not team:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(TeamMember).filter(
        TeamMember.team_id == team.id,
        TeamMember.user_id == data.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already a member")

    member = TeamMember(
        team_id=team.id,
        user_id=data.user_id,
        role="member",
        cadence_days=7,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    return TeamMemberOut(
        id=member.id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        user_title=user.title,
        user_avatar_url=user.avatar,
        role=member.role,
        cadence_days=member.cadence_days,
        last_meeting_date=None,
        status_color="red",
        is_registered=True,
    )

@router.post("/{team_id}/members", response_model=TeamMemberOut)
def add_member_manually(team_id: int, user_id: int, role: str = "member", db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(TeamMember).filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already a member")

    cadence = 7 if role in ("junior", "member") else 14
    member = TeamMember(
        team_id=team_id,
        user_id=user_id,
        role=role,
        cadence_days=cadence,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    return TeamMemberOut(
        id=member.id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        user_title=user.title,
        user_avatar_url=user.avatar,
        role=member.role,
        cadence_days=member.cadence_days,
        last_meeting_date=None,
        status_color="red",
        is_registered=True,
    )