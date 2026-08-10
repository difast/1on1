"""RBAC на существующих ролях (тимлид / участник). Блок 2 безопасности.

МОДЕЛЬ РОЛЕЙ НЕ РАСШИРЯЕТСЯ. Роль в этом продукте — не глобальный флаг, а
ОТНОШЕНИЕ к команде: пользователь является «тимлидом» относительно команды,
которой он владеет (teams.team_lead_id), и «участником» относительно команд, где
он состоит (team_members). Поле users.role ('member'/'team_lead'/'admin') —
грубая подсказка для интерфейса, но источник истины по правам — именно отношения
к командам.

Зачем модуль. Раньше проверки роли были разрозненными (`if role == 'lead'` или
`team.team_lead_id == actor` в теле каждого эндпоинта, местами отсутствовали).
Здесь собраны ПЕРЕИСПОЛЬЗУЕМЫЕ примитивы и FastAPI-зависимости, чтобы проверка
роли была единообразной и её нельзя было забыть при добавлении функционала.

Ключевое отличие от Блока 3 (tenancy). Блок 3 отсекает ЧУЖУЮ ОРГАНИЗАЦИЮ:
tenancy.can_access_user даёт доступ ЛЮБОМУ пользователю той же организации. Блок 2
— тоньше, ВНУТРИ организации:
  - участник видит только СВОИ данные;
  - тимлид видит данные участников СВОИХ команд;
  - участник НЕ видит данные другого участника, даже своей команды.
То есть can_view_member (здесь) строго уже, чем tenancy.can_access_user. Оба блока
работают совместно: сначала отсекается чужая организация, затем — неверная роль.

Единый рубильник строгого доступа — тот же флаг, что у Блока 3
(ORG_ISOLATION_ENFORCE): включать оба блока согласованно после проверки клиентов.
"""
from typing import Optional, Set

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.team import Team, TeamMember
from app.utils.auth import require_user
from app.services import tenancy


def enforced() -> bool:
    """Строгий режим (тот же флаг, что у Блока 3)."""
    return tenancy.enforced()


def _uid(user) -> Optional[int]:
    return tenancy._uid(user)


# ── примитивы ролей ───────────────────────────────────────────────────────────

def led_team_ids(db: Session, actor) -> Set[int]:
    """Команды, которыми пользователь руководит (он в них тимлид)."""
    uid = _uid(actor)
    if not uid:
        return set()
    return {tid for (tid,) in db.query(Team.id).filter(Team.team_lead_id == uid).all()}


def is_lead(db: Session, user) -> bool:
    """Является ли пользователь тимлидом хотя бы одной команды."""
    uid = _uid(user)
    if not uid:
        return False
    if db.query(Team.id).filter(Team.team_lead_id == uid).first():
        return True
    # users.role как запасной признак (напр. тимлид без загруженных команд).
    return not isinstance(user, int) and getattr(user, "role", None) == "team_lead"


def leads_team(db: Session, actor, team_id: Optional[int]) -> bool:
    """Актор — тимлид именно этой команды."""
    if team_id is None:
        return False
    uid = _uid(actor)
    t = db.query(Team).filter(Team.id == team_id).first()
    return bool(t and t.team_lead_id == uid)


def is_member_of(db: Session, actor, team_id: Optional[int]) -> bool:
    """Актор состоит в команде (как участник или тимлид)."""
    if team_id is None:
        return False
    uid = _uid(actor)
    if leads_team(db, actor, team_id):
        return True
    return db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == uid
    ).first() is not None


def members_of_led_teams(db: Session, actor) -> Set[int]:
    """Все участники команд, которыми руководит актор."""
    tids = led_team_ids(db, actor)
    if not tids:
        return set()
    return {uid for (uid,) in db.query(TeamMember.user_id)
            .filter(TeamMember.team_id.in_(tids)).all()}


def can_view_member(db: Session, actor, target_user_id: Optional[int]) -> bool:
    """Ядро IDOR по роли: доступ к данным пользователя есть, если это он сам или
    он — участник команды, которой руководит актор. Участник НЕ видит данные
    другого участника (в отличие от tenancy.can_access_user на уровне организации).
    """
    aid = _uid(actor)
    if aid is None or target_user_id is None:
        return False
    if aid == target_user_id:
        return True
    return target_user_id in members_of_led_teams(db, actor)


# ── ассёрты (403 в строгом режиме) ────────────────────────────────────────────

def assert_team_lead(db: Session, actor, team_id: Optional[int],
                     detail: str = "Действие доступно только тимлиду команды") -> None:
    """403, если актор не тимлид указанной команды. Для управленческих действий:
    состав команды, приглашения, командные настройки и т.п."""
    if not enforced():
        return
    if not leads_team(db, actor, team_id):
        raise HTTPException(status_code=403, detail=detail)


def assert_can_view_member(db: Session, actor, target_user_id: Optional[int],
                           detail: str = "Нет доступа к данным этого пользователя") -> None:
    """403, если актор не имеет права видеть данные пользователя (не он сам и не
    его тимлид)."""
    if not enforced():
        return
    if not can_view_member(db, actor, target_user_id):
        raise HTTPException(status_code=403, detail=detail)


def assert_lead_somewhere(db: Session, actor,
                          detail: str = "Раздел доступен только тимлиду") -> None:
    """403, если пользователь не тимлид ни одной команды (для разделов уровня
    тимлида без привязки к конкретной команде)."""
    if not enforced():
        return
    if not is_lead(db, actor):
        raise HTTPException(status_code=403, detail=detail)


# ── FastAPI-зависимости ───────────────────────────────────────────────────────

def require_lead(current=Depends(require_user), db: Session = Depends(get_db)):
    """Зависимость уровня эндпоинта: доступ только тимлиду (руководит хотя бы
    одной командой). Пример: @router.get(..., dependencies=[Depends(require_lead)])
    либо current=Depends(require_lead), когда нужен объект пользователя."""
    assert_lead_somewhere(db, current)
    return current
