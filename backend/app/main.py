import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers import user, team, meeting, task, notification, scheduling, analytics

app = FastAPI(title="Smart 1-on-1", version="0.1.0")

_origins_env = os.getenv("CORS_ORIGINS", "")
_extra_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
_origins = ["http://localhost:3000", "http://127.0.0.1:3000"] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user.router, prefix="/api/users", tags=["users"])
app.include_router(team.router, prefix="/api/teams", tags=["teams"])
app.include_router(meeting.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(task.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(notification.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(scheduling.router, prefix="/api/scheduling", tags=["scheduling"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])

@app.get("/")
@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_ok = False
    from app.database import _DB_URL
    return {
        "status": "ok" if db_ok else "db_error",
        "db": _DB_URL.split("@")[1].split("?")[0],
        "db_ok": db_ok,
    }

@app.post("/api/dev/reset-db", include_in_schema=False)
def reset_db(db: Session = Depends(get_db)):
    db.execute(text("TRUNCATE notifications, tasks, meetings, team_members, teams, users RESTART IDENTITY CASCADE"))
    db.commit()
    return {"ok": True}