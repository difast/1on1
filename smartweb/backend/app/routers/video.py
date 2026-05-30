from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import httpx, os, json, uuid, asyncio
from app.database import get_db, SessionLocal
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.user import User
from app.services.notification_service import NotificationService

router = APIRouter()


# ─── Spontaneous call ────────────────────────────────────────────────────────

class StartCallBody(BaseModel):
    lead_id: int
    team_id: int
    member_ids: List[int]
    is_group: bool = False


@router.post("/start-call")
def start_spontaneous_call(body: StartCallBody, db: Session = Depends(get_db)):
    from datetime import datetime
    room_name = f"1on1-{body.team_id}-{uuid.uuid4().hex[:8]}"
    room_url = f"https://meet.jit.si/{room_name}"

    lead = db.query(User).filter(User.id == body.lead_id).first()
    caller_name = lead.name if lead else "Тимлид"

    meeting_id = None
    if not body.is_group and len(body.member_ids) == 1:
        meeting = Meeting(
            team_id=body.team_id,
            team_lead_id=body.lead_id,
            member_id=body.member_ids[0],
            scheduled_date=datetime.utcnow(),
            status="in_progress",
            agenda="Быстрый созвон",
            jitsi_room_url=room_url,
            jitsi_room_name=room_name,
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        meeting_id = meeting.id

    notif_service = NotificationService(db)
    for member_id in body.member_ids:
        notif_service.call_started(member_id, caller_name, room_url)

    return {"room_url": room_url, "room_name": room_name, "meeting_id": meeting_id}


# ─── Transcript + AI analysis (background) ───────────────────────────────────

async def _transcribe_and_analyze(meeting_id: int, audio_data: bytes, content_type: str):
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return

        transcript = await _transcribe_audio(audio_data, content_type)
        if not transcript:
            print(f"[video] No transcript for meeting {meeting_id}")
            return

        meeting.call_transcript = transcript
        db.commit()

        await _analyze_and_create_tasks(meeting, transcript, db)
    except Exception as e:
        print(f"[video] Background task error for meeting {meeting_id}: {e}")
    finally:
        db.close()


async def _transcribe_audio(audio_data: bytes, content_type: str) -> str:
    api_key = os.getenv("YANDEX_SPEECHKIT_KEY")
    if not api_key:
        print("[video] YANDEX_SPEECHKIT_KEY not set")
        return ""

    # Short audio (< 1 MB ≈ 60 seconds) → synchronous API
    if len(audio_data) <= 1_000_000:
        return await _transcribe_sync(audio_data, content_type, api_key)

    # Long audio → async API via Yandex Object Storage
    return await _transcribe_async(audio_data, content_type, api_key)


async def _transcribe_sync(audio_data: bytes, content_type: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize",
            headers={
                "Authorization": f"Api-Key {api_key}",
                "Content-Type": content_type or "audio/ogg",
            },
            content=audio_data,
            params={"lang": "ru-RU", "topic": "general"},
        )
    if r.status_code == 200:
        return r.json().get("result", "")
    print(f"[video] Yandex STT sync error {r.status_code}: {r.text}")
    return ""


async def _transcribe_async(audio_data: bytes, content_type: str, api_key: str) -> str:
    bucket_key_id = os.getenv("YANDEX_BUCKET_KEY_ID")
    bucket_key_secret = os.getenv("YANDEX_BUCKET_KEY_SECRET")
    bucket_name = os.getenv("YANDEX_BUCKET_NAME")

    if not all([bucket_key_id, bucket_key_secret, bucket_name]):
        # Fallback: process first 1 MB and warn
        print("[video] Object Storage not configured, truncating audio to 1 MB")
        return await _transcribe_sync(audio_data[:1_000_000], content_type, api_key)

    # Upload to Yandex Object Storage (S3-compatible)
    import boto3
    from botocore.client import Config

    s3 = boto3.client(
        "s3",
        endpoint_url="https://storage.yandexcloud.net",
        aws_access_key_id=bucket_key_id,
        aws_secret_access_key=bucket_key_secret,
        config=Config(signature_version="s3v4"),
        region_name="ru-central1",
    )
    file_key = f"recordings/{uuid.uuid4().hex}.ogg"
    s3.put_object(
        Bucket=bucket_name,
        Key=file_key,
        Body=audio_data,
        ContentType=content_type or "audio/ogg",
    )
    audio_uri = f"https://storage.yandexcloud.net/{bucket_name}/{file_key}"

    # Submit async recognition job
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize",
            headers={
                "Authorization": f"Api-Key {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "config": {
                    "specification": {
                        "languageCode": "ru-RU",
                        "model": "general",
                        "audioChannelCount": 1,
                        "enableSpeakerLabeling": True,
                        "maxSpeakerCount": 2,
                    }
                },
                "audio": {"uri": audio_uri},
            },
        )
    if r.status_code != 200:
        print(f"[video] Yandex STT async submit error {r.status_code}: {r.text}")
        return ""

    operation_id = r.json().get("id", "")
    if not operation_id:
        return ""

    # Poll for result (up to 10 minutes, every 10 seconds)
    for _ in range(60):
        await asyncio.sleep(10)
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"https://operation.api.cloud.yandex.net/operations/{operation_id}",
                headers={"Authorization": f"Api-Key {api_key}"},
            )
        result = r.json()
        if not result.get("done"):
            continue

        lines = []
        for chunk in result.get("response", {}).get("chunks", []):
            for alt in chunk.get("alternatives", []):
                speaker = chunk.get("channelTag", "0")
                text = alt.get("text", "").strip()
                if text:
                    lines.append(f"[Спикер {speaker}]: {text}")
        return "\n".join(lines)

    print(f"[video] Yandex STT async timeout for operation {operation_id}")
    return ""


async def _analyze_and_create_tasks(meeting: Meeting, transcript: str, db: Session):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    ai_base = os.getenv("ANTHROPIC_BASE_URL", "https://api.aitunnel.ru")
    if not api_key:
        print("[video] ANTHROPIC_API_KEY not set")
        return

    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.post(
            f"{ai_base}/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1500,
                "messages": [{
                    "role": "user",
                    "content": (
                        "Ты анализируешь транскрипцию встречи 1-on-1 между руководителем и сотрудником.\n"
                        "Верни ТОЛЬКО валидный JSON без пояснений:\n"
                        "{\n"
                        '  "summary": "краткое резюме встречи (2-4 предложения)",\n'
                        '  "tasks": [{"title": "название задачи", "assigned_to": "member"}]\n'
                        "}\n"
                        "assigned_to = 'member' (сотрудник) или 'lead' (руководитель).\n\n"
                        f"Транскрипция:\n{transcript[:5000]}"
                    ),
                }],
            },
        )

    try:
        content = r.json()["content"][0]["text"].strip()
        # Extract JSON if wrapped in markdown
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        if "{" in content and "}" in content:
            content = content[content.index("{"):content.rindex("}") + 1]
        parsed = json.loads(content)
    except Exception as e:
        print(f"[video] Claude response parse error: {e}")
        return

    if parsed.get("summary"):
        meeting.ai_summary = parsed["summary"]
        db.commit()

    notif_service = NotificationService(db)
    for t in parsed.get("tasks", []):
        assigned_to = (
            meeting.member_id
            if t.get("assigned_to") == "member"
            else meeting.team_lead_id
        )
        task = Task(
            meeting_id=meeting.id,
            team_id=meeting.team_id,
            assigned_to=assigned_to,
            assigned_by=meeting.team_lead_id,
            title=t["title"],
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        assigner = db.query(User).filter(User.id == meeting.team_lead_id).first()
        assigner_name = assigner.name if assigner else "Тимлид"
        notif_service.task_assigned(assigned_to, task.id, t["title"], assigner_name)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/meetings/{meeting_id}/upload-recording")
async def upload_recording(
    meeting_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    audio_data = await file.read()
    content_type = file.content_type or "audio/ogg"

    background_tasks.add_task(_transcribe_and_analyze, meeting_id, audio_data, content_type)

    return {"ok": True, "message": "Запись принята, транскрипция запущена", "size_kb": len(audio_data) // 1024}


@router.get("/meetings/{meeting_id}/transcript")
def get_transcript(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {
        "has_transcript": bool(meeting.call_transcript),
        "transcript": meeting.call_transcript,
        "ai_summary": meeting.ai_summary,
        "jitsi_room_url": meeting.jitsi_room_url,
    }
