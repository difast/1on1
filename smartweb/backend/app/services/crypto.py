"""Шифрование секретов «в покое» (токены календарей) без внешних зависимостей.

В requirements нет пакета cryptography (PyJWT работает на HS256), а тянуть его
ради токенов рискованно для сборки. Поэтому используем аутентифицированный
поточный шифр только на стандартной библиотеке:

  keystream = HMAC-SHA256(enc_key, nonce || counter)   (CTR-режим)
  ciphertext = plaintext XOR keystream
  tag = HMAC-SHA256(mac_key, nonce || ciphertext)      (encrypt-then-MAC)

Ключи enc_key/mac_key выводятся из SECRET_KEY через HKDF-подобное расширение.
Формат хранения: base64url("v1" || nonce(16) || tag(32) || ciphertext).

Этого достаточно, чтобы токены не лежали открытым текстом в БД и не читались
без серверного секрета. Токены НИКОГДА не пишем в логи (см. вызовы).
"""
import base64
import hashlib
import hmac
import os

from app.config import settings, ConfigError

_MAGIC = b"v1"
_NONCE_LEN = 16
_TAG_LEN = 32


def _root_key() -> bytes:
    """Корневой ключ шифрования — ТОЛЬКО из SECRET_KEY, без значения по умолчанию.

    Раньше здесь был откат на строку "change-me": при незаданном SECRET_KEY все
    токены календарей шифровались ключом, выводимым из общеизвестного значения,
    то есть дампа БД хватало для их расшифровки. Теперь отсутствие SECRET_KEY —
    явная ошибка конфигурации: подключить календарь нельзя, но и мнимой защиты
    тоже нет."""
    key = settings.secret_key
    if not key:
        raise ConfigError("Не задан SECRET_KEY — шифрование токенов интеграций невозможно")
    # SECRET_KEY может быть коротким/строкой — нормализуем в 32 байта.
    return hashlib.sha256(key.encode("utf-8")).digest()


def _derive(label: bytes) -> bytes:
    return hmac.new(_root_key(), b"oneonone-token-" + label, hashlib.sha256).digest()


def _keystream(enc_key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hmac.new(enc_key, nonce + counter.to_bytes(8, "big"), hashlib.sha256).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def encrypt(plaintext: str | None) -> str | None:
    """Зашифровать строку токена. None/пусто -> None (нечего хранить)."""
    if not plaintext:
        return None
    data = plaintext.encode("utf-8")
    nonce = os.urandom(_NONCE_LEN)
    enc_key = _derive(b"enc")
    mac_key = _derive(b"mac")
    ciphertext = bytes(a ^ b for a, b in zip(data, _keystream(enc_key, nonce, len(data))))
    tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
    blob = _MAGIC + nonce + tag + ciphertext
    return base64.urlsafe_b64encode(blob).decode("ascii")


def decrypt(token: str | None) -> str | None:
    """Расшифровать. Возвращает None при пустом входе или нарушении целостности."""
    if not token:
        return None
    try:
        blob = base64.urlsafe_b64decode(token.encode("ascii"))
    except Exception:
        return None
    if len(blob) < len(_MAGIC) + _NONCE_LEN + _TAG_LEN or blob[:len(_MAGIC)] != _MAGIC:
        return None
    off = len(_MAGIC)
    nonce = blob[off:off + _NONCE_LEN]; off += _NONCE_LEN
    tag = blob[off:off + _TAG_LEN]; off += _TAG_LEN
    ciphertext = blob[off:]
    mac_key = _derive(b"mac")
    expected = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, tag):
        return None
    enc_key = _derive(b"enc")
    data = bytes(a ^ b for a, b in zip(ciphertext, _keystream(enc_key, nonce, len(ciphertext))))
    try:
        return data.decode("utf-8")
    except Exception:
        return None
