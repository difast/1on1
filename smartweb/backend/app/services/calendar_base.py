"""Абстракция провайдера календаря (по аналогии с payments_base.py).

Бизнес-логика синхронизации встреч (создать/обновить/удалить событие) не знает,
Google это или Яндекс — она работает с общим интерфейсом CalendarProvider.
Google и Яндекс подключаются как две реализации.

Единица обмена — CalendarEvent: провайдер-независимое описание события, которое
каждая реализация превращает в вызов своего API.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CalendarEvent:
    uid: str                    # стабильный идентификатор со стороны OneOnOne
    summary: str
    description: str
    start: datetime             # UTC
    end: datetime               # UTC
    location: str | None = None


@dataclass
class OAuthTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    account_email: str | None = None


class CalendarProvider(ABC):
    """Общий контракт провайдера календаря."""
    name = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        """Заданы ли client_id/secret/redirect в окружении."""
        ...

    @abstractmethod
    def authorize_url(self, state: str) -> str:
        """URL страницы согласия OAuth, куда отправляем пользователя."""
        ...

    @abstractmethod
    def exchange_code(self, code: str) -> OAuthTokens:
        """Обменять authorization code на access/refresh токены."""
        ...

    @abstractmethod
    def refresh(self, refresh_token: str) -> OAuthTokens:
        """Обновить access token по refresh token."""
        ...

    @abstractmethod
    def upsert_event(self, access_token: str, calendar_id: str | None,
                     event: CalendarEvent, external_id: str | None) -> str:
        """Создать или обновить событие. Возвращает external_id события."""
        ...

    @abstractmethod
    def delete_event(self, access_token: str, calendar_id: str | None,
                     external_id: str) -> None:
        """Удалить событие по external_id (идемпотентно)."""
        ...


class CalendarAuthError(Exception):
    """Токен недействителен/отозван — интеграции нужен повторный OAuth."""


def get_calendar_provider(provider: str) -> CalendarProvider:
    """Фабрика провайдера по коду ("google" | "yandex")."""
    if provider == "google":
        from app.services.calendar_google import GoogleCalendarProvider
        return GoogleCalendarProvider()
    if provider == "yandex":
        from app.services.calendar_yandex import YandexCalendarProvider
        return YandexCalendarProvider()
    raise ValueError(f"Unknown calendar provider: {provider}")


SUPPORTED_PROVIDERS = ("google", "yandex")
