import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import user, team, meeting, task, notification, scheduling

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart 1-on-1", version="0.1.0")

_origins_env = os.getenv("CORS_ORIGINS", "")
_extra_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
_origins = ["http://localhost:3000", "http://127.0.0.1:3000"] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user.router, prefix="/api/users", tags=["users"])
app.include_router(team.router, prefix="/api/teams", tags=["teams"])
app.include_router(meeting.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(task.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(notification.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(scheduling.router, prefix="/api/scheduling", tags=["scheduling"])

@app.get("/api/health")
def health_check():
    return {"status": "ok"}