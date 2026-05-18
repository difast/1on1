from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import users, teams, meetings, tasks, notifications, scheduling

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart 1-on-1", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(teams.router, prefix="/api/teams", tags=["teams"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(scheduling.router, prefix="/api/scheduling", tags=["scheduling"])

@app.get("/api/health")
def health_check():
    return {"status": "ok"}