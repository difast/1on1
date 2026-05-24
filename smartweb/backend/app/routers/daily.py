from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
import httpx, os, json
from app.database import get_db
from app.models.meeting import Meeting
from app.models.task import Task

router = APIRouter()


@router.post("/webhook")
async def daily_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    action = body.get("action", "")

    if action == "transcription-ready":
        payload = body.get("payload", {})
        room_name = payload.get("roomName", "")
        transcript_url = payload.get("transcriptUrl", "")

        if not room_name or not transcript_url:
            return {"ok": True}

        meeting = db.query(Meeting).filter(Meeting.daily_room_name == room_name).first()
        if not meeting:
            return {"ok": True}

        try:
            with httpx.Client(timeout=30) as client:
                r = client.get(transcript_url)
                data = r.json()

            lines = []
            for item in (data.get("results", {}).get("utterances") or []):
                speaker = item.get("speaker", "?")
                text = item.get("transcript", "").strip()
                if text:
                    lines.append(f"[{speaker}]: {text}")
            transcript_text = "\n".join(lines)

            meeting.call_transcript = transcript_text
            db.commit()

            anthropic_key = os.getenv("ANTHROPIC_API_KEY")
            ai_base = os.getenv("ANTHROPIC_BASE_URL", "https://api.aitunnel.ru")
            if anthropic_key and transcript_text:
                with httpx.Client(timeout=60) as client:
                    r = client.post(
                        f"{ai_base}/v1/messages",
                        headers={
                            "x-api-key": anthropic_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": "claude-haiku-4-5-20251001",
                            "max_tokens": 1024,
                            "messages": [{
                                "role": "user",
                                "content": (
                                    "Из транскрипции встречи 1-on-1 выдели задачи. "
                                    "Верни ТОЛЬКО JSON массив без лишнего текста: "
                                    "[{\"title\": \"...\", \"assigned_to\": \"member\"}] "
                                    "где assigned_to = 'member' или 'lead'.\n\n"
                                    f"Транскрипция:\n{transcript_text[:3000]}"
                                ),
                            }],
                        },
                    )
                    result = r.json()

                content = result["content"][0]["text"].strip()
                if "[" in content:
                    content = content[content.index("["):content.rindex("]") + 1]
                tasks_data = json.loads(content)

                for t in tasks_data:
                    assigned_to = (
                        meeting.member_id
                        if t.get("assigned_to") == "member"
                        else meeting.team_lead_id
                    )
                    db.add(Task(
                        meeting_id=meeting.id,
                        team_id=meeting.team_id,
                        assigned_to=assigned_to,
                        assigned_by=meeting.team_lead_id,
                        title=t["title"],
                    ))
                db.commit()

        except Exception as e:
            print(f"Daily webhook error: {e}")

    return {"ok": True}
