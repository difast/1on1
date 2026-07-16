import os
import time
import asyncio
import httpx
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
_app_start_time = time.time()
from app.database import get_db
from app.routers import user, team, meeting, task, notification, scheduling, analytics, note, video, mood, knowledge, assistant, subtask, checkin, support, billing, admin_billing, company


def _seed_billing():
    """Ensure the plan catalog exists (idempotent)."""
    from app.database import SessionLocal
    from app.services.plans import seed_plans
    db = SessionLocal()
    try:
        seed_plans(db)
    except Exception:
        pass
    finally:
        db.close()

async def _keep_alive():
    """Ping own health endpoint every 4 minutes to prevent Railway from sleeping."""
    port = os.getenv("PORT", "8080")
    url = f"http://127.0.0.1:{port}/api/health"
    await asyncio.sleep(60)  # wait for server to be fully up
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            try:
                await client.get(url)
            except Exception:
                pass
            await asyncio.sleep(240)  # 4 minutes

def _send_mood_reminders():
    """Create + push the daily 'fill the mood survey' reminder (once/day, deduped)."""
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.notification import Notification
    from app.utils.push import send_push_bulk
    db = SessionLocal()
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        already = db.query(Notification).filter(
            Notification.type == "mood_reminder",
            Notification.created_at >= today,
        ).first()
        if already:
            return
        members = db.query(User).filter(User.is_blocked == False, User.role == "member").all()
        title = "Как прошёл ваш день?"
        body = "Пройдите короткий опрос настроения в приложении"
        msgs = []
        for u in members:
            db.add(Notification(user_id=u.id, type="mood_reminder", title=title, body=body, read=False))
            if u.push_token and str(u.push_token).startswith("ExponentPushToken"):
                msgs.append({
                    "to": u.push_token, "title": title, "body": body,
                    "sound": "default", "priority": "high", "data": {"type": "mood_reminder"},
                })
        db.commit()
        if msgs:
            send_push_bulk(msgs)
    except Exception:
        pass
    finally:
        db.close()


async def _mood_reminder_loop():
    """Fire the mood-survey reminder daily at 20:00 МСК (17:00 UTC). In-process
    scheduler since Celery beat is not running on this deployment."""
    await asyncio.sleep(90)
    while True:
        try:
            now = datetime.utcnow()
            if now.hour == 17 and now.minute < 5:  # 20:00 Moscow time
                await asyncio.to_thread(_send_mood_reminders)
        except Exception:
            pass
        await asyncio.sleep(60)


def _billing_sweep():
    """Dunning: handle expired trials/periods.
    - trialing expired (no card) -> downgrade to free
    - active expired -> past_due; after GRACE days -> downgrade to free
    GRACE configurable via BILLING_GRACE_DAYS (default 3).
    """
    from datetime import timedelta
    from app.database import SessionLocal
    from app.models.subscription import Subscription
    from app.services import subscriptions as subs
    grace = int(os.getenv("BILLING_GRACE_DAYS", "3"))
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        rows = db.query(Subscription).filter(
            Subscription.status.in_(("trialing", "active", "past_due")),
        ).all()
        for s in rows:
            end = s.current_period_end
            if not end or end > now:
                continue
            if s.status == "trialing":
                subs.downgrade_to_free(db, s)
            elif s.status == "active":
                subs.set_status(db, s, "past_due")
            elif s.status == "past_due":
                if end + timedelta(days=grace) <= now:
                    subs.downgrade_to_free(db, s)
        # Daily investor-metrics snapshot for historical charts.
        try:
            from app.services import metrics as _metrics
            _metrics.snapshot(db)
        except Exception:
            db.rollback()
    except Exception:
        pass
    finally:
        db.close()


async def _billing_sweep_loop():
    """Run the billing sweep daily (in-process scheduler, no Celery beat here)."""
    await asyncio.sleep(120)
    while True:
        try:
            await asyncio.to_thread(_billing_sweep)
        except Exception:
            pass
        await asyncio.sleep(6 * 3600)  # every 6 hours


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_billing()
    task = asyncio.create_task(_keep_alive())
    mood_task = asyncio.create_task(_mood_reminder_loop())
    billing_task = asyncio.create_task(_billing_sweep_loop())
    yield
    task.cancel()
    mood_task.cancel()
    billing_task.cancel()

app = FastAPI(title="Smart 1-on-1", version="0.1.0", lifespan=lifespan)

# NOTE: Database migrations are run by start.sh (`alembic upgrade head`) BEFORE
# uvicorn boots. Do NOT run them again in a startup event — a second in-process
# upgrade can block on the alembic_version lock and hang "application startup",
# leaving the server unable to accept requests (every API call then times out).

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
app.include_router(note.router, prefix="/api/notes", tags=["notes"])
app.include_router(video.router, prefix="/api/video", tags=["video"])
app.include_router(mood.router, prefix="/api/mood", tags=["mood"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])
app.include_router(subtask.router, prefix="/api/subtasks", tags=["subtasks"])
app.include_router(checkin.router, prefix="/api/checkins", tags=["checkins"])
app.include_router(support.router, prefix="/api/support", tags=["support"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(admin_billing.router, prefix="/api/admin/billing", tags=["admin-billing"])
app.include_router(company.router, prefix="/api/companies", tags=["companies"])

@app.get("/")
@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    db_host = os.environ.get("DATABASE_URL", "").split("@")[-1].split("?")[0]
    error = None
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_ok = False
        error = str(e)
    return {
        "status": "ok" if db_ok else "db_error",
        "db": db_host,
        "db_ok": db_ok,
        "error": error,
    }

@app.get("/api/health/detailed")
def health_detailed(db: Session = Depends(get_db)):
    import alembic.runtime.migration as mig
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_cmd
    import io, contextlib

    uptime_s = int(time.time() - _app_start_time)

    # DB latency
    t0 = time.perf_counter()
    db_ok = True
    db_error = None
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        db_error = str(e)
    db_latency_ms = round((time.perf_counter() - t0) * 1000, 1)

    # Current migration revision
    try:
        result = db.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).fetchone()
        current_rev = result[0] if result else None
    except Exception:
        current_rev = None

    # User / meeting counts
    try:
        user_count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
        meeting_count = db.execute(text("SELECT COUNT(*) FROM meetings")).scalar()
        ticket_count = db.execute(text("SELECT COUNT(*) FROM support_tickets WHERE read_by_admin = false")).scalar()
    except Exception:
        user_count = meeting_count = ticket_count = None

    return {
        "status": "ok" if db_ok else "db_error",
        "uptime_seconds": uptime_s,
        "db_ok": db_ok,
        "db_latency_ms": db_latency_ms,
        "db_error": db_error,
        "migration_rev": current_rev,
        "stats": {
            "users": user_count,
            "meetings": meeting_count,
            "open_tickets": ticket_count,
        },
        "services": {
            "api": "ok",
            "database": "ok" if db_ok else "error",
            "celery": "not_configured",
        }
    }

@app.post("/api/dev/reset-db", include_in_schema=False)
def reset_db(db: Session = Depends(get_db)):
    # DESTRUCTIVE: wipes every table. Disabled unless explicitly enabled via env
    # so it can never be triggered against the production database. To use it in a
    # local/dev environment set ENABLE_DEV_ENDPOINTS=1.
    if os.getenv("ENABLE_DEV_ENDPOINTS", "").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="Not found")
    db.execute(text("TRUNCATE notifications, tasks, meetings, team_members, teams, users RESTART IDENTITY CASCADE"))
    db.commit()
    return {"ok": True}