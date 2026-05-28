import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import List
from datetime import datetime
from app.database import get_db
from app.models.team import Team, TeamMember
from app.models.user import User
from app.models.meeting import Meeting
from app import online as online_cache
from app.schemas.team import TeamCreate, TeamOut, TeamDetailOut, TeamMemberOut, JoinByCode

router = APIRouter()


def generate_invite_code():
    return secrets.token_urlsafe(8)


def build_team_detail(team: Team, team_id: int, db: Session) -> TeamDetailOut:
    """Build TeamDetailOut using batch queries instead of per-member queries."""
    member_user_ids = [tm.user_id for tm in team.members]

    # Batch-load all users in one query
    users_map = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(member_user_ids)).all()
    } if member_user_ids else {}

    # Batch-load last meeting date per member in one query
    last_meeting_rows = (
        db.query(Meeting.member_id, sqlfunc.max(Meeting.scheduled_date).label("last_date"))
        .filter(
            Meeting.team_id == team_id,
            Meeting.status != "cancelled",
            Meeting.scheduled_date <= datetime.utcnow(),
        )
        .group_by(Meeting.member_id)
        .all()
    )
    last_meeting_map = {row.member_id: row.last_date for row in last_meeting_rows}

    members_out = []
    for tm in team.members:
        user = users_map.get(tm.user_id)
        last_date = last_meeting_map.get(tm.user_id)

        color = "green"
        if last_date:
            days_since = (datetime.utcnow() - last_date).days
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
            last_meeting_date=last_date,
            status_color=color,
            is_registered=user is not None,
            is_online=online_cache.is_online(tm.user_id) if user else False,
        ))

    return TeamDetailOut(
        id=team.id,
        name=team.name,
        invite_code=team.invite_code,
        team_lead_id=team.team_lead_id,
        created_at=team.created_at,
        members=members_out,
    )


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


# Must come before /{team_id} to avoid route conflict
@router.get("/by-member/{user_id}", response_model=TeamDetailOut)
def get_team_for_member(user_id: int, db: Session = Depends(get_db)):
    """Return the team detail for a regular member (non-lead role)."""
    membership = (
        db.query(TeamMember)
        .filter(TeamMember.user_id == user_id, TeamMember.role != "lead")
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member of any team")

    team = db.query(Team).filter(Team.id == membership.team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    return build_team_detail(team, team.id, db)


@router.get("/{team_id}", response_model=TeamDetailOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return build_team_detail(team, team_id, db)


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


@router.post("/{team_id}/regenerate-invite")
def regenerate_invite_code(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    team.invite_code = generate_invite_code()
    db.commit()
    db.refresh(team)
    return {"invite_code": team.invite_code}


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
