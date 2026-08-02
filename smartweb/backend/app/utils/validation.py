"""Общие ограничения для входящих данных.

Здесь собраны типы полей с разумными верхними границами и вспомогательные
функции. Смысл ограничений не в том, чтобы отсекать «неправильных»
пользователей, а в том, чтобы запрос не мог занять неограниченный объём памяти
и места в базе: без max_length любое текстовое поле принимает хоть сотню
мегабайт, и это укладывает процесс задолго до того, как сработают тарифные
лимиты.

Границы подобраны с большим запасом относительно реального использования:
заголовок задачи в 200 символов, повестка встречи в 20 000, ответ на опрос в
2 000. Легитимные сценарии в них укладываются.
"""
from __future__ import annotations

import re
from typing import Annotated, Optional

from pydantic import Field, StringConstraints

# ── Типовые длины ────────────────────────────────────────────────────────────
# Короткие поля: имена, названия, коды, ссылки на профили.
ShortStr = Annotated[str, StringConstraints(max_length=200)]
OptShortStr = Optional[Annotated[str, StringConstraints(max_length=200)]]

# Имя человека или команды.
NameStr = Annotated[str, StringConstraints(max_length=120)]
OptNameStr = Optional[Annotated[str, StringConstraints(max_length=120)]]

# Адрес электронной почты. Формат и обязательность проверяются в роутере
# (_validate_email) — там же формулируются понятные сообщения об ошибке. Здесь
# только верхняя граница длины (ограничение SMTP на адрес — 254 символа).
EmailStr = Annotated[str, StringConstraints(max_length=254)]
OptEmailStr = Optional[Annotated[str, StringConstraints(max_length=254)]]

# Пароль: только верхняя граница. Требования к сложности намеренно оставлены в
# роутере (_validate_password): там они выдают понятный текст на языке
# пользователя, а не машинную ошибку схемы. Потолок нужен и по памяти, и
# потому что bcrypt всё равно использует лишь первые 72 байта.
PasswordStr = Annotated[str, StringConstraints(max_length=128)]

# Токены подтверждения/сброса — фиксированной длины, но берём с запасом.
TokenStr = Annotated[str, StringConstraints(max_length=512)]

# Средние тексты: описание задачи, комментарий, сообщение в поддержку.
TextStr = Annotated[str, StringConstraints(max_length=5000)]
OptTextStr = Optional[Annotated[str, StringConstraints(max_length=5000)]]

# Длинные тексты: повестка встречи, заметки, статья базы знаний.
LongTextStr = Annotated[str, StringConstraints(max_length=20000)]
OptLongTextStr = Optional[Annotated[str, StringConstraints(max_length=20000)]]

# Ссылка (URL вебхука, адрес календаря).
UrlStr = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
OptUrlStr = Optional[Annotated[str, StringConstraints(max_length=2000)]]

# Аватар приходит с клиента как data URI с картинкой в base64. Клиент режет
# изображение до 256x256 (AvatarCropModal), что даёт порядка 40-60 КБ. Потолок
# в 700 000 символов оставляет запас примерно вдесятеро и при этом не даёт
# положить в строку базы мегабайты.
OptAvatarStr = Optional[Annotated[str, StringConstraints(max_length=700000)]]

# Токен push-уведомлений Expo.
OptPushTokenStr = Optional[Annotated[str, StringConstraints(max_length=256)]]

# Идентификатор сущности: положительное целое. Отсекает 0, отрицательные и
# заведомо невозможные значения до похода в базу.
EntityId = Annotated[int, Field(ge=1, le=2_147_483_647)]
OptEntityId = Optional[Annotated[int, Field(ge=1, le=2_147_483_647)]]


# ── Экранирование шаблонов LIKE ──────────────────────────────────────────────

_LIKE_SPECIAL = re.compile(r"([%_\\])")


def escape_like(value: str | None, max_len: int = 100) -> str:
    """Подготовить пользовательскую строку для подстановки в ILIKE.

    Инъекции SQL здесь нет — SQLAlchemy передаёт шаблон отдельным параметром.
    Проблема в другом: символы % и _ в тексте пользователя меняют смысл поиска,
    а строка из одних процентов («%%%%%%…») заставляет базу перебирать таблицу
    целиком. Экранируем спецсимволы и ограничиваем длину.

    Использовать вместе с .ilike(pattern, escape="\\\\").
    """
    if not value:
        return ""
    return _LIKE_SPECIAL.sub(r"\\\1", value.strip()[:max_len])


# ── Пагинация ────────────────────────────────────────────────────────────────

# Потолок на количество записей в одном ответе. Без него запрос с limit=10**9
# вытягивает таблицу целиком: и нагрузка на базу, и объём ответа.
MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50


def clamp_limit(limit: int | None, default: int = DEFAULT_PAGE_SIZE,
                maximum: int = MAX_PAGE_SIZE) -> int:
    """Привести запрошенный размер страницы к допустимому диапазону."""
    if limit is None:
        return default
    try:
        n = int(limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(n, maximum))
