"""Единый механизм изоляции данных между организациями (Блок 3 безопасности).

ГРАНИЦА ОРГАНИЗАЦИИ В ЭТОМ ПРОДУКТЕ — ЭТО КОМАНДА (Team).
Отдельной таблицы Organization над командами нет: пользователь принадлежит
организации через членство в команде (team_members) и/или через роль тимлида
(teams.team_lead_id). Несколько команд одного тимлида — это его «организация»
(сценарий Business-тарифа с несколькими командами).

Зачем отдельный модуль. Историческая архитектура определяла «кто действует» по
идентификатору из тела/строки запроса (body user_id, team_lead_id, member_id) и
доставала объекты по сырому id без проверки принадлежности организации. Это
классический IDOR на уровне организации: любой аутентифицированный пользователь,
подставив чужой id, мог прочитать/изменить данные другой компании. Здесь собраны
ПЕРЕИСПОЛЬЗУЕМЫЕ примитивы изоляции, чтобы:
  - проверка организации была одна и та же во всех эндпоинтах;
  - её нельзя было забыть при добавлении нового функционала (единый вызов);
  - фильтрация по организации применялась централизованно к запросам.

Разделение уровней (НЕ смешивать — см. требование задачи):
  - Блок 3 (этот модуль): изоляция ОРГАНИЗАЦИЙ — «компания А не видит компанию Б».
    Критерий доступа к данным пользователя — общая организация (общая команда).
  - Блок 2 (роли): «тимлид видит участника, участник — только себя» — это уровень
    РОЛЕЙ внутри организации, он решается отдельно и здесь НЕ реализуется.

Поэтапный раскат. Механизм включается флагом ORG_ISOLATION_ENFORCE (по аналогии с
AUTH_ENFORCE). При выключенном флаге проверки не блокируют запросы — это позволяет
выкатить код и убедиться, что легитимные клиенты (веб и мобильное приложение,
использующие один и тот же API) не задеты, прежде чем включать жёсткий режим в
окружении (ORG_ISOLATION_ENFORCE=1). Легитимный клиент всегда обращается только к
своим данным, поэтому включение флага отклоняет ровно межорганизационный доступ.
"""
from typing import Optional, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.team import Team, TeamMember


def enforced() -> bool:
    """Включён ли жёсткий режим изоляции (ORG_ISOLATION_ENFORCE)."""
    return bool(getattr(settings, "org_isolation_enforce", False))


def _uid(user) -> Optional[int]:
    """Достать id из объекта User или принять готовый int/None."""
    if user is None:
        return None
    if isinstance(user, int):
        return user
    return getattr(user, "id", None)


def user_team_ids(db: Session, user_id: Optional[int]) -> Set[int]:
    """Все team_id, к которым пользователь принадлежит: как участник и как тимлид.

    Это и есть «организация(и)» пользователя. Пустое множество — пользователь без
    команды: в жёстком режиме он не видит ничего, привязанного к организации.
    """
    uid = _uid(user_id)
    if not uid:
        return set()
    ids: Set[int] = set()
    for (tid,) in db.query(Team.id).filter(Team.team_lead_id == uid).all():
        ids.add(tid)
    for (tid,) in db.query(TeamMember.team_id).filter(TeamMember.user_id == uid).all():
        ids.add(tid)
    return ids


def can_access_team(db: Session, user, team_id: Optional[int]) -> bool:
    """Доступна ли команда/организация пользователю.

    team_id == None означает запись вне конкретной команды (общий справочник или
    личная сущность) — по границе организации её не режем; такие случаи фильтруются
    отдельно (по владельцу) там, где это нужно.
    """
    if team_id is None:
        return True
    return team_id in user_team_ids(db, _uid(user))


def can_access_user(db: Session, actor, target_user_id: Optional[int]) -> bool:
    """Может ли actor обращаться к данным пользователя target на уровне ОРГАНИЗАЦИИ.

    Критерий — общая организация (хотя бы одна общая команда) либо это он сам.
    Роль (тимлид/участник) здесь НЕ проверяется — это уровень Блока 2.
    """
    actor_id = _uid(actor)
    if actor_id is None or target_user_id is None:
        return False
    if actor_id == target_user_id:
        return True
    return bool(user_team_ids(db, actor_id) & user_team_ids(db, target_user_id))


# ── Ассёрты для эндпоинтов (бросают HTTPException в жёстком режиме) ────────────

_ORG_DENIED = "Нет доступа к данным этой организации"


def assert_team_access(db: Session, user, team_id: Optional[int],
                       detail: str = _ORG_DENIED) -> None:
    """403, если команда team_id не принадлежит организации пользователя."""
    if not enforced():
        return
    if not can_access_team(db, user, team_id):
        raise HTTPException(status_code=403, detail=detail)


def assert_user_access(db: Session, actor, target_user_id: Optional[int],
                       detail: str = _ORG_DENIED) -> None:
    """403, если actor и target из разных организаций."""
    if not enforced():
        return
    if not can_access_user(db, actor, target_user_id):
        raise HTTPException(status_code=403, detail=detail)


def assert_object_team(db: Session, user, obj, attr: str = "team_id",
                       not_found: str = "Not found") -> None:
    """Проверить принадлежность объекта организации по его полю team_id.

    Возвращает 404 (а не 403), чтобы не подтверждать существование чужого объекта.
    Если у объекта team_id пуст (личная/общая запись), проверка по команде не
    применяется — вызывающий код при необходимости проверяет владельца отдельно.
    """
    if not enforced() or obj is None:
        return
    team_id = getattr(obj, attr, None)
    if team_id is None:
        return
    if not can_access_team(db, user, team_id):
        raise HTTPException(status_code=404, detail=not_found)


def assert_owner_or_org(db: Session, user, owner_user_id: Optional[int],
                        not_found: str = "Not found") -> None:
    """Для сущностей без собственного team_id (личные записи: заметки, план
    развития и т.п.): доступ, если это владелец или пользователь той же
    организации. 404 при отказе."""
    if not enforced():
        return
    if not can_access_user(db, user, owner_user_id):
        raise HTTPException(status_code=404, detail=not_found)


# ── Скоупинг запросов (для списков) ───────────────────────────────────────────

def scope_by_team(query, column, db: Session, user, include_null: bool = False):
    """Ограничить запрос строками, чей column (team_id) в организации пользователя.

    include_null=True добавляет общие записи (team_id IS NULL), например общий
    справочник навыков или общие статьи базы знаний.
    """
    if not enforced():
        return query
    ids = user_team_ids(db, user)
    if not ids:
        # Пользователь без организации: только общие записи (или ничего).
        return query.filter(column.is_(None)) if include_null else query.filter(column.in_([-1]))
    if include_null:
        return query.filter((column.in_(ids)) | (column.is_(None)))
    return query.filter(column.in_(ids))
