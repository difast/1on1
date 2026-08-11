"""Блок 6 безопасности: безопасная загрузка файлов (аватар, записи встреч).

Проверяем определение РЕАЛЬНОГО типа по содержимому (magic bytes), отклонение
SVG и не-картинок для аватара, лимит размера, а также проверку содержимого
записи встречи по сигнатуре (а не по заголовку Content-Type от клиента).

Запуск (SQLite в файле):
    python tests/test_upload_security.py
"""
import os
import sys
import base64
import tempfile
import datetime as _dt

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-assertions")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-assertions")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["ADMIN_PASSWORD"] = "test-admin-password"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import warnings
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.team import Team, TeamMember  # noqa: E402
from app.models.meeting import Meeting  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.passwords import hash_password  # noqa: E402
from app.utils import ratelimit, filetype  # noqa: E402

Base.metadata.create_all(bind=engine)
client = TestClient(main.app, raise_server_exceptions=False)

FAILS = []


def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + (f"  |  {info}" if info and not cond else ""))
    if not cond:
        FAILS.append(name)


def fresh_limits():
    ratelimit._store = ratelimit._MemoryStore()


def auth(uid):
    return {"Authorization": f"Bearer {create_access_token(uid)}"}


# ── Образцы содержимого (magic bytes) ─────────────────────────────────────────
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 12
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 8
OGG = b"OggS\x00\x02" + b"\x00" * 20
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 20
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 8
SVG = b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>"
TEXT = b"this is definitely not an image or audio file, just text bytes"
EXE = b"MZ\x90\x00" + b"\x00" * 20  # PE-заголовок исполняемого файла


print("\n== Определение типа по содержимому (magic bytes) ==")
check("PNG распознан как image/png", filetype.detect_mime(PNG) == "image/png")
check("JPEG распознан как image/jpeg", filetype.detect_mime(JPEG) == "image/jpeg")
check("WEBP распознан как image/webp", filetype.detect_mime(WEBP) == "image/webp")
check("OGG распознан как audio/ogg", filetype.detect_mime(OGG) == "audio/ogg")
check("WEBM распознан как video/webm", filetype.detect_mime(WEBM) == "video/webm")
check("MP4 распознан как video/mp4", filetype.detect_mime(MP4) == "video/mp4")
check("SVG НЕ является растровой картинкой", filetype.is_image(SVG) is None)
check("текст не распознан как файл", filetype.detect_mime(TEXT) is None)
check("исполняемый (MZ) не распознан", filetype.detect_mime(EXE) is None)
check("PNG проходит как изображение", filetype.is_image(PNG) == "image/png")
check("OGG проходит как аудио/видео", filetype.is_audio_video(OGG) == "audio/ogg")
check("PNG НЕ проходит как аудио/видео", filetype.is_audio_video(PNG) is None)


print("\n== Валидатор аватара (data URI) ==")
from app.utils.filetype import validate_avatar_data_uri, AvatarError


def avatar_ok(name, value):
    try:
        validate_avatar_data_uri(value)
        check(name, True)
    except AvatarError as e:
        check(name, False, f"отклонён: {e}")


def avatar_rejected(name, value):
    try:
        validate_avatar_data_uri(value)
        check(name, False, "принят, а должен быть отклонён")
    except AvatarError:
        check(name, True)


avatar_ok("валидный PNG data URI принят", "data:image/png;base64," + base64.b64encode(PNG).decode())
avatar_ok("пустой аватар допустим (снятие)", "")
avatar_rejected("SVG-аватар отклонён (защита от JS)",
                "data:image/svg+xml;base64," + base64.b64encode(SVG).decode())
avatar_rejected("текст под видом картинки отклонён",
                "data:image/png;base64," + base64.b64encode(TEXT).decode())
avatar_rejected("исполняемый под видом картинки отклонён",
                "data:image/png;base64," + base64.b64encode(EXE).decode())
avatar_rejected("не-data-URI отклонён", "http://evil/x.png")
avatar_rejected("не-base64 data URI отклонён",
                "data:image/svg+xml,<svg onload=alert(1)>")
avatar_rejected("слишком большой аватар отклонён",
                "data:image/png;base64," + base64.b64encode(PNG[:8] + b"\x00" * (600 * 1024)).decode())


# ── Пользователь и встреча для проверки эндпоинтов ────────────────────────────
db = SessionLocal()
u = User(name="Тест", email="up@a.com", role="team_lead",
         password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(u); db.commit(); db.refresh(u)
uid = u.id
m = User(name="Участник", email="upm@a.com", role="member",
         password_hash=hash_password("Parol12345"), email_confirmed=True)
db.add(m); db.commit(); db.refresh(m)
mid_user = m.id
team = Team(name="U6", invite_code="code6u", team_lead_id=uid)
db.add(team); db.commit(); db.refresh(team)
tid = team.id
db.add(TeamMember(team_id=tid, user_id=uid, role="lead"))
db.add(TeamMember(team_id=tid, user_id=mid_user, role="member"))
db.commit()
mtg = Meeting(team_id=tid, team_lead_id=uid, member_id=mid_user,
              scheduled_date=_dt.datetime.utcnow(), status="scheduled")
db.add(mtg); db.commit(); db.refresh(mtg)
mtg_id = mtg.id
db.close()


print("\n== Эндпоинт аватара: PATCH /api/users/{id} ==")
fresh_limits()
r = client.patch(f"/api/users/{uid}",
                 json={"avatar": "data:image/svg+xml;base64," + base64.b64encode(SVG).decode()},
                 headers=auth(uid))
check("аватар-SVG через API отклонён -> 422", r.status_code == 422, f"код {r.status_code}")
r = client.patch(f"/api/users/{uid}",
                 json={"avatar": "data:image/png;base64," + base64.b64encode(PNG).decode()},
                 headers=auth(uid))
check("валидный PNG-аватар через API принят -> 200", r.status_code == 200, f"код {r.status_code}")


print("\n== Эндпоинт записи встречи: содержимое проверяется по сигнатуре ==")
fresh_limits()
# Текст под видом audio/ogg (заголовок Content-Type подделан) -> 415 по magic bytes.
r = client.post(f"/api/video/meetings/{mtg_id}/upload-recording",
                files={"file": ("rec.ogg", TEXT, "audio/ogg")}, headers=auth(uid))
check("подделанный Content-Type (текст) отклонён -> 415", r.status_code == 415, f"код {r.status_code}")
# Исполняемый под видом записи -> 415.
fresh_limits()
r = client.post(f"/api/video/meetings/{mtg_id}/upload-recording",
                files={"file": ("rec.ogg", EXE, "audio/ogg")}, headers=auth(uid))
check("исполняемый под видом записи отклонён -> 415", r.status_code == 415, f"код {r.status_code}")
# Настоящая OGG-сигнатура -> принято (200); фоновая транскрипция без ключа тихо выйдет.
fresh_limits()
r = client.post(f"/api/video/meetings/{mtg_id}/upload-recording",
                files={"file": ("rec.ogg", OGG + b"\x00" * 200, "audio/ogg")}, headers=auth(uid))
check("настоящая аудио-запись принята -> 200", r.status_code == 200, f"код {r.status_code}")
# Посторонний (не участник встречи) не может загрузить запись -> 403/404.
fresh_limits()
outsider = None
_db = SessionLocal()
o = User(name="Чужой", email="out6@b.com", role="member",
         password_hash=hash_password("Parol12345"), email_confirmed=True)
_db.add(o); _db.commit(); _db.refresh(o); outsider = o.id
_db.close()
r = client.post(f"/api/video/meetings/{mtg_id}/upload-recording",
                files={"file": ("rec.ogg", OGG + b"\x00" * 200, "audio/ogg")}, headers=auth(outsider))
check("посторонний не может загрузить запись -> 403", r.status_code == 403, f"код {r.status_code}")


print("\n" + "=" * 60)
if FAILS:
    print(f"ПРОВАЛЕНО тестов: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("Все проверки безопасности загрузки файлов пройдены.")
