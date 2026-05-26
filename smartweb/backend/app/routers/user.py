from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User
from app.models.team import Team
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter()

@router.get("/by-email/{email}", response_model=UserOut)
def get_user_by_email(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/", response_model=UserOut)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/admin/stats")
def get_admin_stats(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    teams = db.query(Team).all()
    leads = [u for u in users if u.role == 'team_lead']
    members = [u for u in users if u.role == 'member']
    return {
        "total_users": len(users),
        "total_teams": len(teams),
        "total_leads": len(leads),
        "total_members": len(members),
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "title": u.title or "",
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "teams": [
            {"id": t.id, "name": t.name, "created_at": t.created_at.isoformat() if t.created_at else None}
            for t in teams
        ],
    }

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
