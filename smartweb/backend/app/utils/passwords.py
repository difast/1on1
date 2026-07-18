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
