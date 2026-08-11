"""Прозрачное прикладное шифрование текстовых полей БД (Блок 9, Этап 1).

EncryptedText — тип-декоратор SQLAlchemy: на запись значение шифруется
(crypto.encrypt), на чтение расшифровывается (crypto.decrypt_field, с прозрачной
поддержкой ранее сохранённого открытого текста). Прикладной код работает с полем
как с обычной строкой — шифрование/расшифровка происходят на границе ORM.

Ключ шифрования выводится из SECRET_KEY (переменная окружения), в БД не хранится —
то есть ключ отделён от зашифрованных данных (требование Этапа 1). Дамп базы без
серверного секрета не раскрывает содержимое зашифрованных полей.

Выбор полей осознанный: шифруем только самое чувствительное свободное содержимое,
которое читается поштучно и почти никогда не фильтруется по содержимому, чтобы не
платить расшифровкой на массовых выборках. Не шифруем то, что участвует в
сортировке/поиске/агрегатах.
"""
from sqlalchemy.types import TypeDecorator, Text

from app.services import crypto


class EncryptedText(TypeDecorator):
    """Text-поле, прозрачно шифруемое в состоянии покоя."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return crypto.encrypt_field(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return crypto.decrypt_field(value)
