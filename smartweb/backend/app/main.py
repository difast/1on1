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
from app.config import settings
from app.routers import user, team, meeting, task, notification, scheduling, analytics, note, video, mood, knowledge, assistant, subtask, checkin, support, billing, admin_billing, company, telegram, auth, proposal, interaction, task_proposal, goal, development


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
    """Ежедневный опрос настроения участникам (задача 7). Для КАЖДОЙ команды в её
    ЧАСОВОМ ПОЯСЕ, начиная с 20:00, рассылаем участникам приглашение заполнить
    опрос — один раз в локальные сутки, по всем каналам (веб-уведомление, push,
    Telegram). Отдельная рассылка от сводки лиду в 10:00. Защита от дублей и от
    пропуска: дедуп по команде за локальные сутки; если время уже >= 20:00, а
    сегодня ещё не рассылали — догоняем после простоя сервера."""
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.team import Team, TeamMember
    from app.models.notification import Notification
    from app.utils.push import send_push_bulk
    from app.services import mood_service
    db = SessionLocal()
    try:
        utc = ZoneInfo("UTC")
        title = "Как прошёл ваш день?"
        body = "Пройдите короткий опрос настроения в приложении"
        pushes = []
        for team in db.query(Team).all():
            try:
                tz = mood_service.team_tz(db, team.id)
                local_now = datetime.now(utc).astimezone(tz)
                if local_now.hour < 20:
                    continue  # опрос уходит в 20:00 локального времени команды (с догоном до конца суток)
                local_midnight_utc = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(utc).replace(tzinfo=None)
                # Участники команды (кроме лида) — им адресован опрос.
                member_ids = [tm.user_id for tm in db.query(TeamMember).filter(TeamMember.team_id == team.id).all()
                              if tm.user_id != team.team_lead_id]
                if not member_ids:
                    continue
                # Дедуп на уровне команды за локальные сутки: если сегодня уже
                # рассылали хотя бы одному участнику — пропускаем всю команду.
                already = db.query(Notification).filter(
                    Notification.type == "mood_reminder",
                    Notification.user_id.in_(member_ids),
                    Notification.created_at >= local_midnight_utc,
                ).first()
                if already:
                    continue
                users = db.query(User).filter(User.id.in_(member_ids), User.is_blocked == False).all()  # noqa: E712
                for u in users:
                    db.add(Notification(user_id=u.id, type="mood_reminder", title=title, body=body, read=False))
                    if u.push_token and str(u.push_token).startswith("ExponentPushToken"):
                        pushes.append({
                            "to": u.push_token, "title": title, "body": body,
                            "sound": "default", "priority": "high", "data": {"type": "mood_reminder"},
                        })
                    # Telegram-канал: тот же вопрос настроения кнопками 1..5.
                    if getattr(u, "telegram_id", None):
                        try:
                            from app.services.telegram_bot import _send_mood_question
                            _send_mood_question(u.telegram_id, team.id)
                        except Exception:
                            pass
                db.commit()
            except Exception:
                db.rollback()
        if pushes:
            send_push_bulk(pushes)
    except Exception:
        pass
    finally:
        db.close()


async def _mood_reminder_loop():
    """Проверяем раз в минуту — срабатывание в 20:00 по поясу каждой команды, с
    дедупом и догоном после простоя (см. _send_mood_reminders). In-process
    планировщик, поскольку Celery beat здесь не запущен."""
    await asyncio.sleep(90)
    while True:
        try:
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


def _send_mood_summaries():
    """Ежедневная сводка настроения (задача 13). Для каждой команды в её ЧАСОВОМ
    ПОЯСЕ, начиная с 10:00, отправляем тимлиду анонимную сводку за день — один раз
    в сутки. Защита от дублей и от пропуска: если сводка за локальные сутки ещё
    не отправлена и локальное время уже >= 10:00 — отправляем (догоняем после
    простоя сервера, но не раньше 10:00). Анонимность: при недостатке данных
    отдаём сообщение о недостаточности вместо статистики (13.5)."""
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.models.team import Team
    from app.models.notification import Notification
    from app.services import mood_service
    from app.services.notification_service import NotificationService
    db = SessionLocal()
    try:
        utc = ZoneInfo("UTC")
        for team in db.query(Team).all():
            try:
                tz = mood_service.team_tz(db, team.id)
                local_now = datetime.now(utc).astimezone(tz)
                if local_now.hour < 10:
                    continue  # сбор опросов ещё идёт — сводку не шлём до 10:00
                # Локальная полночь -> UTC (naive) для сравнения с created_at.
                local_midnight_utc = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(utc).replace(tzinfo=None)
                already = db.query(Notification).filter(
                    Notification.user_id == team.team_lead_id,
                    Notification.type == "mood_summary",
                    Notification.created_at >= local_midnight_utc,
                ).first()
                if already:
                    continue
                s = mood_service.team_summary(db, team.id, ref=local_now.date())
                if s.get("insufficient"):
                    body = f"Недостаточно данных для анонимной статистики за сегодня (заполнили {s['filled']} из {s['team_size']}, нужно от {s['threshold']})."
                else:
                    delta = s.get("delta_prev")
                    delta_txt = "" if delta is None else f" Динамика к вчера: {'+' if delta > 0 else ''}{delta}."
                    body = (f"Средний уровень: {s['avg']} из 5. "
                            f"Заполнили: {s['filled']} из {s['team_size']}"
                            + (f" ({s['share_pct']}%)." if s.get('share_pct') is not None else ".")
                            + delta_txt)
                NotificationService(db).create_notification(
                    user_id=team.team_lead_id, type="mood_summary",
                    title="Сводка настроения команды", body=body,
                    data={"team_id": team.id, "summary": s},
                )
            except Exception:
                db.rollback()
    except Exception:
        pass
    finally:
        db.close()


async def _mood_summary_loop():
    """Проверяем раз в минуту — точное срабатывание в 10:00 по поясу каждой
    команды, с дедупом и догоном после простоя (см. _send_mood_summaries)."""
    await asyncio.sleep(100)
    while True:
        try:
            await asyncio.to_thread(_send_mood_summaries)
        except Exception:
            pass
        await asyncio.sleep(60)


async def _telegram_polling_loop():
    """Long polling для Telegram — альтернатива вебхуку (TELEGRAM_MODE=polling).
    Нужен, когда входящий трафик до сервера фильтруется и Telegram не может
    достучаться до вебхука: бот сам ходит за апдейтами через getUpdates.

    Перед стартом ОБЯЗАТЕЛЬНО снимаем вебхук (deleteWebhook) — иначе getUpdates
    отдаёт 409, а сам факт двойного канала грозил бы двойной обработкой.
    Каждый апдейт обрабатываем в отдельной сессии БД тем же handle_update, что
    и вебхук, — общая логика, без дублирования обработчиков."""
    import logging
    from app.config import settings
    from app.database import SessionLocal
    from app.services import telegram as tg
    log = logging.getLogger("telegram.polling")

    if (settings.telegram_mode or "webhook").lower() != "polling":
        return
    if not tg.bot_token():
        log.warning("TELEGRAM_MODE=polling, но TELEGRAM_BOT_TOKEN не задан — polling не запущен")
        return

    await asyncio.sleep(5)  # дать серверу подняться
    # Снимаем вебхук (без сброса накопленной очереди — обработаем её).
    try:
        res = await asyncio.to_thread(tg.delete_webhook, False)
        log.info("polling: deleteWebhook -> %s", res)
    except Exception as e:
        log.warning("polling: deleteWebhook error: %s", e)

    offset: int | None = None
    from app.services import telegram_bot
    while True:
        try:
            updates = await asyncio.to_thread(tg.get_updates, offset, 25)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("polling: getUpdates error: %s", e)
            await asyncio.sleep(5)  # backoff, чтобы не долбить API при сбое
            continue
        for upd in updates:
            offset = int(upd["update_id"]) + 1
            db = SessionLocal()
            try:
                await asyncio.to_thread(telegram_bot.handle_update, db, upd)
            except Exception as e:
                log.warning("polling: handle_update error: %s", e)
            finally:
                db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_billing()
    task = asyncio.create_task(_keep_alive())
    mood_task = asyncio.create_task(_mood_reminder_loop())
    mood_summary_task = asyncio.create_task(_mood_summary_loop())
    billing_task = asyncio.create_task(_billing_sweep_loop())
    # Polling запускается сам, только если TELEGRAM_MODE=polling (иначе выходит
    # сразу и остаётся штатный режим вебхука).
    tg_poll_task = asyncio.create_task(_telegram_polling_loop())
    yield
    task.cancel()
    mood_task.cancel()
    mood_summary_task.cancel()
    billing_task.cancel()
    tg_poll_task.cancel()

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

# ── Этап 8: принудительная проверка JWT (AUTH_ENFORCE) ───────────────────────
# Единый гейт вместо правки каждого роутера: при AUTH_ENFORCE=1 любой запрос к
# /api/* вне публичного списка обязан нести валидный Bearer-JWT, иначе 401.
# Публичный список — только точки входа (регистрация/логин/восстановление),
# точки входа Telegram, платёжный вебхук и health. Проверяется лишь подлинность
# и срок действия токена (без БД) — то есть аутентификация; авторизация по
# владению ресурсом остаётся на следующий подэтап (перевод идентификации с
# body user_id на токен).
from starlette.responses import JSONResponse as _JSONResponse
import jwt as _jwt

_AUTH_PUBLIC_EXACT = {
    "/", "/healthz",
    "/api/auth/register", "/api/auth/login", "/api/auth/admin-login",
    "/api/auth/forgot-password", "/api/auth/reset-password",
    "/api/auth/confirm-email", "/api/auth/resend-confirmation",
    "/api/telegram/config", "/api/telegram/webhook",
    "/api/telegram/miniapp-auth", "/api/telegram/callback", "/api/telegram/link",
    "/api/billing/plans", "/api/billing/webhooks/cloudpayments",
}
_AUTH_PUBLIC_PREFIX = ("/api/health",)


def _auth_is_public(path: str) -> bool:
    p = path.rstrip("/") or "/"
    if p in _AUTH_PUBLIC_EXACT:
        return True
    return any(p.startswith(pref) for pref in _AUTH_PUBLIC_PREFIX)


def _auth_token_valid(authorization: str | None) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    try:
        _jwt.decode(token, settings.jwt_signing_key, algorithms=["HS256"])
        return True
    except Exception:
        return False


@app.middleware("http")
async def _auth_enforce_gate(request, call_next):
    if settings.auth_enforce and request.method != "OPTIONS":
        path = request.url.path
        if path.startswith("/api/") and not _auth_is_public(path):
            if not _auth_token_valid(request.headers.get("authorization")):
                return _JSONResponse(
                    {"detail": "Не авторизовано"}, status_code=401,
                )
    return await call_next(request)

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
app.include_router(telegram.router, prefix="/api/telegram", tags=["telegram"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(proposal.router, prefix="/api/proposals", tags=["proposals"])
app.include_router(task_proposal.router, prefix="/api/task-proposals", tags=["task-proposals"])
app.include_router(goal.router, prefix="/api/goals", tags=["goals"])
app.include_router(development.router, prefix="/api/development", tags=["development"])
app.include_router(interaction.router, prefix="/api/interactions", tags=["interactions"])

@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/healthz", methods=["GET", "HEAD"])
@app.api_route("/api/health/live", methods=["GET", "HEAD"])
def health_live():
    """Liveness без зависимостей (без БД/Redis) — всегда 200, пока процесс жив.
    Отвечает и на GET, и на HEAD: платформенные health-проверки (в т.ч. Timeweb
    App Platform, которая шлёт HEAD /) не должны получать 405 и перезапускать
    контейнер. БД тут не трогаем, чтобы проверка не падала при её недоступности."""
    return {"status": "ok"}


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