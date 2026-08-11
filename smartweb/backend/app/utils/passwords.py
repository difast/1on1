"""Хэширование паролей (bcrypt). Открытые пароли никогда не хранятся и не
логируются — только bcrypt-хэш.
"""
import bcrypt


def hash_password(plain: str) -> str:
    # bcrypt ограничен 72 байтами — длинные пароли усекаются самим алгоритмом.
    digest = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt())
    return digest.decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# Целевой cost-фактор bcrypt. gensalt() по умолчанию использует 12 — держим тот
# же ориентир для прозрачной миграции старых хэшей с меньшей стоимостью.
BCRYPT_TARGET_ROUNDS = 12


def needs_rehash(hashed: str | None) -> bool:
    """Нужно ли перехэшировать (cost-фактор ниже целевого). Перехэширование
    делается ПРИ УСПЕШНОМ входе, без принудительного сброса паролей (Этап 1)."""
    if not hashed:
        return False
    try:
        # Формат bcrypt: $2b$<rounds>$<...>
        parts = hashed.split("$")
        rounds = int(parts[2])
        return rounds < BCRYPT_TARGET_ROUNDS
    except Exception:
        return False
