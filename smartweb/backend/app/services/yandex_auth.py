"""Вход через Yandex ID: поиск/создание/связывание аккаунта.

Калька с services/telegram.py (resolve_web_login): для одного человека не
должно появляться двух профилей.

Порядок сопоставления (важен именно такой):
  1. по users.yandex_id — стабильный идентификатор провайдера. Основной и
     единственный критерий для повторных входов: если человек сменил почту в
     Яндексе, он всё равно попадёт в свой аккаунт, а чужой аккаунт с этой почтой
     угнать нельзя;
  2. по подтверждённому провайдером email — связывание с уже существующим
     аккаунтом (email/пароль или Telegram), чтобы не плодить дубли;
  3. иначе — создаём нового пользователя.

Заполнение профиля (имя, аватар, email) происходит ТОЛЬКО в момент создания или
первой привязки и только для пустых полей. При последующих входах данные из
Яндекса не трогают профиль: если пользователь загрузил своё фото или изменил
имя вручную, это не будет перезаписано.
"""
import logging

from sqlalchemy.orm import Session

from app.models.user import User

log = logging.getLogger("yandex_auth")


def find_by_yandex_id(db: Session, yandex_id: str) -> User | None:
    return db.query(User).filter(User.yandex_id == str(yandex_id)).first()


def find_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def _fill_empty_profile_fields(user: User, profile: dict) -> None:
    """Заполнить ПУСТЫЕ поля профиля данными Yandex ID.

    Вызывается только при создании аккаунта и при первой привязке Yandex ID.
    Непустые поля не трогаем никогда — это и есть правило «данные из Яндекса не
    перезаписывают то, что пользователь изменил сам».
    """
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


def attach_yandex_to_user(db: Session, target: User, profile: dict) -> User:
    """Привязать yandex_id к существующему аккаунту и дозаполнить пустые поля."""
    target.yandex_id = str(profile["yandex_id"])
    # Почта пришла от провайдера подтверждённой: если это тот же адрес, что уже
    # в аккаунте, снимаем с человека необходимость подтверждать её письмом.
    email = profile.get("email")
    if email and (target.email or "").strip().lower() == email:
        target.email_confirmed = True
    _fill_empty_profile_fields(target, profile)
    db.commit()
    db.refresh(target)
    return target


def create_from_yandex(db: Session, profile: dict) -> User:
    """Создать пользователя по данным Yandex ID. Роль пустая — её выбирают в
    онбординге, как и при входе через Telegram."""
    user = User(
        name=(profile.get("name") or profile.get("login") or "Пользователь")[:255],
        email=profile.get("email"),
        role="",
        yandex_id=str(profile["yandex_id"]),
        avatar=profile.get("avatar"),
        # Email от Yandex ID уже подтверждён провайдером — письма не шлём.
        email_confirmed=bool(profile.get("email")),
    )
    db.add(user); db.commit(); db.refresh(user)
    # Пробный период тарифа Start (14 дней) — как при обычной регистрации и
    # при входе через Telegram.
    try:
        from app.services import subscriptions as subs
        subs.start_signup_trial(db, "user", user.id)
    except Exception:
        db.rollback()
    return user


def resolve_login(db: Session, profile: dict, link_user_id: int | None = None):
    """Вход через Yandex ID. Возвращает (user, status): login|created|linked."""
    yandex_id = str(profile["yandex_id"])

    # Явная привязка из профиля (пользователь уже авторизован).
    if link_user_id:
        target = db.query(User).filter(User.id == link_user_id).first()
        if not target:
            raise ValueError("user_not_found")
        existing = find_by_yandex_id(db, yandex_id)
        if existing and existing.id != target.id:
            raise ValueError("yandex_in_use")
        return attach_yandex_to_user(db, target, profile), "linked"

    # 1) Стабильный идентификатор провайдера — повторный вход.
    user = find_by_yandex_id(db, yandex_id)
    if user:
        # Профиль не трогаем: имя/аватар могли быть изменены пользователем.
        return user, "login"

    # 2) Связывание с существующим аккаунтом по подтверждённому email.
    email = profile.get("email")
    if email:
        existing = find_by_email(db, email)
        if existing:
            if existing.yandex_id and existing.yandex_id != yandex_id:
                # К аккаунту уже привязан другой Яндекс ID — молча
                # переподвязывать нельзя, это увело бы чужой аккаунт.
                raise ValueError("email_in_use")
            log.info("yandex id: связываем с существующим аккаунтом id=%s", existing.id)
            return attach_yandex_to_user(db, existing, profile), "linked"

    # 3) Новый пользователь.
    return create_from_yandex(db, profile), "created"
