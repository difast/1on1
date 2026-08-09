"""Вход через VK ID: поиск/создание/связывание аккаунта.

Полная калька с services/yandex_auth.py (и через него — с telegram): для одного
человека не должно появляться двух профилей.

Порядок сопоставления (важен именно такой):
  1. по users.vk_id — стабильный идентификатор провайдера. Основной критерий
     для повторных входов: сменив почту во VK, человек всё равно попадёт в свой
     аккаунт, а чужой аккаунт с этой почтой угнать нельзя;
  2. по подтверждённому провайдером email — связывание с уже существующим
     аккаунтом (email/пароль, Telegram или Yandex ID), чтобы не плодить дубли,
     с защитой от угона (409, если к найденному по email аккаунту уже привязан
     ДРУГОЙ VK ID);
  3. иначе — создаём нового пользователя.

Заполнение профиля (имя, аватар, email) — ТОЛЬКО при создании или первой
привязке и только для пустых полей: если пользователь изменил имя/фото вручную,
данные из VK их не перезаписывают.
"""
import logging

from sqlalchemy.orm import Session

from app.models.user import User

log = logging.getLogger("vk_auth")


def find_by_vk_id(db: Session, vk_id: str) -> User | None:
    return db.query(User).filter(User.vk_id == str(vk_id)).first()


def find_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def _fill_empty_profile_fields(user: User, profile: dict) -> None:
    """Заполнить ПУСТЫЕ поля профиля данными VK ID. Непустые не трогаем никогда."""
    email = profile.get("email")
    if email and not user.email:
        user.email = email
        # Email подтверждён провайдером — письмо-подтверждение не отправляем.
        user.email_confirmed = True
    name = profile.get("name")
    if name and not (user.name or "").strip():
        user.name = name
    avatar = profile.get("avatar")
    if avatar and not user.avatar:
        user.avatar = avatar


def attach_vk_to_user(db: Session, target: User, profile: dict) -> User:
    """Привязать vk_id к существующему аккаунту и дозаполнить пустые поля."""
    target.vk_id = str(profile["vk_id"])
    email = profile.get("email")
    if email and (target.email or "").strip().lower() == email:
        target.email_confirmed = True
    _fill_empty_profile_fields(target, profile)
    db.commit()
    db.refresh(target)
    return target


def create_from_vk(db: Session, profile: dict) -> User:
    """Создать пользователя по данным VK ID. Роль пустая — её выбирают в
    онбординге, как при входе через Telegram и Yandex ID."""
    user = User(
        name=(profile.get("name") or "Пользователь")[:255],
        email=profile.get("email"),
        role="",
        vk_id=str(profile["vk_id"]),
        avatar=profile.get("avatar"),
        # Email от VK ID уже подтверждён провайдером — письма не шлём.
        email_confirmed=bool(profile.get("email")),
    )
    db.add(user); db.commit(); db.refresh(user)
    # Пробный период тарифа Start (14 дней) — как при обычной регистрации и при
    # входе через Telegram/Yandex ID.
    try:
        from app.services import subscriptions as subs
        subs.start_signup_trial(db, "user", user.id)
    except Exception:
        db.rollback()
    return user


def resolve_login(db: Session, profile: dict, link_user_id: int | None = None):
    """Вход через VK ID. Возвращает (user, status): login|created|linked."""
    vk_id = str(profile["vk_id"])

    # Явная привязка из профиля (пользователь уже авторизован).
    if link_user_id:
        target = db.query(User).filter(User.id == link_user_id).first()
        if not target:
            raise ValueError("user_not_found")
        existing = find_by_vk_id(db, vk_id)
        if existing and existing.id != target.id:
            raise ValueError("vk_in_use")
        return attach_vk_to_user(db, target, profile), "linked"

    # 1) Стабильный идентификатор провайдера — повторный вход.
    user = find_by_vk_id(db, vk_id)
    if user:
        return user, "login"

    # 2) Связывание с существующим аккаунтом по подтверждённому email.
    email = profile.get("email")
    if email:
        existing = find_by_email(db, email)
        if existing:
            if existing.vk_id and existing.vk_id != vk_id:
                # К аккаунту уже привязан ДРУГОЙ VK ID — молча переподвязывать
                # нельзя, это увело бы чужой аккаунт.
                raise ValueError("email_in_use")
            log.info("vk id: связываем с существующим аккаунтом id=%s", existing.id)
            return attach_vk_to_user(db, existing, profile), "linked"

    # 3) Новый пользователь.
    return create_from_vk(db, profile), "created"
