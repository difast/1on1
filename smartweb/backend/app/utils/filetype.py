"""Определение РЕАЛЬНОГО типа файла по содержимому (magic bytes), Блок 6.

Клиентские данные о типе (расширение имени, заголовок Content-Type, префикс
data:image/... в data URI) подделываются тривиально, поэтому доверять им нельзя.
Здесь тип определяется по сигнатуре в первых байтах файла.

Реализация — на стандартной библиотеке, без python-magic/libmagic: набор
загружаемых форматов узкий (растровые картинки для аватара; аудио/видео для
записей встреч), их сигнатуры фиксированы и стабильны, а системная зависимость
libmagic усложнила бы сборку. Если в будущем появится приём произвольных
документов сотрудников — тогда есть смысл в полноценном определителе типов и
антивирусе (см. отчёт по Блоку 6).
"""
import base64
import binascii
from typing import Optional, Tuple

# Растровые изображения, разрешённые для аватара и подобного. SVG СОЗНАТЕЛЬНО не
# входит: это XML, который может содержать встроенный JavaScript (XSS при показе
# как документа) — пользовательские картинки принимаем только растровыми.
IMAGE_MIME = {"image/png", "image/jpeg", "image/webp", "image/gif"}

# Аудио/видео контейнеры для записей встреч (транскрипция).
AUDIO_VIDEO_MIME = {
    "audio/ogg", "audio/wav", "audio/mpeg", "audio/aac",
    "audio/mp4", "video/mp4", "audio/webm", "video/webm",
}


def detect_mime(data: bytes) -> Optional[str]:
    """Определить MIME по сигнатуре. None — тип не распознан среди поддерживаемых.

    Возвращаем канонический MIME. Для контейнеров mp4/webm возвращаем видео-вариант
    как обобщённый (audio/mp4 и video/mp4 неразличимы по одной сигнатуре ftyp)."""
    if not data or len(data) < 12:
        return None
    b = data

    # ── Изображения ──
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"

    # ── Аудио/видео ──
    if b[:4] == b"OggS":
        return "audio/ogg"
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return "audio/wav"
    if b[:4] == b"\x1a\x45\xdf\xa3":          # EBML (Matroska/WebM)
        return "video/webm"
    if b[4:8] == b"ftyp":                      # ISO BMFF (mp4/m4a/mov)
        return "video/mp4"
    if b[:3] == b"ID3":                        # MP3 с ID3-тегом
        return "audio/mpeg"
    if b[0] == 0xFF and (b[1] & 0xE0) == 0xE0:  # MP3 frame sync / ADTS AAC
        return "audio/aac" if (b[1] & 0x06) == 0x00 and (b[1] & 0x10) else "audio/mpeg"

    return None


def is_image(data: bytes) -> Optional[str]:
    """MIME растрового изображения или None (в т.ч. для SVG/не-картинок)."""
    mime = detect_mime(data)
    return mime if mime in IMAGE_MIME else None


def is_audio_video(data: bytes) -> Optional[str]:
    """MIME аудио/видео-контейнера или None."""
    mime = detect_mime(data)
    return mime if mime in AUDIO_VIDEO_MIME else None


class AvatarError(ValueError):
    """Аватар не прошёл проверку (не картинка, SVG, слишком большой, битый)."""


# Предел РАЗМЕРА декодированного изображения аватара. Клиент режет до 256x256
# (~40-60 КБ); 512 КБ — щедрый потолок, отсекающий попытки залить мегабайты.
AVATAR_MAX_DECODED_BYTES = 512 * 1024


def validate_avatar_data_uri(value: Optional[str]) -> Optional[str]:
    """Проверить аватар-строку (data URI) на СЕРВЕРЕ по содержимому.

    Возвращает исходную строку, если это корректный растровый data URI в пределах
    размера. Бросает AvatarError, если содержимое не является разрешённым растровым
    изображением (в т.ч. SVG, произвольные/битые данные) или превышает лимит.

    Пустое значение допустимо (означает «не менять/убрать аватар») и проходит.
    Формат: data:<mime>;base64,<payload>. Проверяем именно ДЕКОДИРОВАННЫЕ байты
    по magic bytes, а не заявленный mime в префиксе."""
    if value is None or value == "":
        return value
    s = value.strip()
    if not s.startswith("data:"):
        raise AvatarError("Аватар должен быть data URI изображения")
    try:
        header, payload = s.split(",", 1)
    except ValueError:
        raise AvatarError("Некорректный формат аватара")
    if ";base64" not in header.lower():
        # Не-base64 data URI (напр. url-encoded SVG-текст) не принимаем.
        raise AvatarError("Аватар должен быть закодирован в base64")
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise AvatarError("Не удалось декодировать изображение аватара")
    if len(raw) > AVATAR_MAX_DECODED_BYTES:
        raise AvatarError("Изображение аватара слишком большое")
    mime = is_image(raw)
    if not mime:
        # Сюда попадают SVG (это XML, не растровое изображение) и любые не-картинки.
        raise AvatarError("Допустимы только изображения PNG, JPEG, WEBP или GIF")
    return value
