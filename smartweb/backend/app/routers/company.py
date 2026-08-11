"""Компания рабочего пространства (Этапы 2-4).

- Поиск по ИНН/БИН через DaData (прокси, ключ на сервере) — /companies/suggest.
- Реквизиты пространства (одна компания на команду) — CRUD /companies/by-team/{id}.

Ничего не блокирует: у пространства может не быть компании. Данные понадобятся
позже, на этапе оплаты. Ручной ввод — запасной вариант, если DaData не нашла.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import httpx

from app.database import get_db
from app.utils import ratelimit
from app.config import settings
from app.models.team import Team, TeamMember
from app.models.company import CompanyProfile
from app.utils.auth import require_user

from typing import Annotated
from pydantic import Field
from app.utils.validation import (
    ShortStr, OptShortStr, TextStr, OptTextStr, LongTextStr, OptLongTextStr,
    EntityId, OptEntityId,
)


router = APIRouter()

# DaData suggest endpoints. RU — party, KZ — party_kz. Переопределяемо через env
# при необходимости, но по умолчанию — официальные пути.
_DADATA_BASE = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest"
_DADATA_METHOD = {"ru": "party", "kz": "party_kz"}


def _norm_ru(s: dict) -> dict:
    """Нормализуем ответ DaData (РФ) в плоскую структуру для автозаполнения."""
    d = s.get("data") or {}
    name = d.get("name") or {}
    address = d.get("address") or {}
    mgmt = d.get("management") or {}
    okveds = d.get("okved")
    return {
        "name": (name.get("short_with_opf") or name.get("full_with_opf")
                 or s.get("value") or ""),
        "inn": d.get("inn") or "",
        "kpp": d.get("kpp") or "",
        "ogrn": d.get("ogrn") or "",
        "legal_address": (address.get("unrestricted_value")
                          or (address.get("value") if isinstance(address, dict) else "") or ""),
        "industry": (f"ОКВЭД {okveds}" if okveds else ""),
        "management": mgmt.get("name") or "",
        "status": ((d.get("state") or {}).get("status")) or "",
        "country": "RU",
    }


def _norm_kz(s: dict) -> dict:
    """Нормализуем ответ DaData (КЗ). Поля отличаются от РФ (БИН вместо ИНН)."""
    d = s.get("data") or {}
    name = d.get("name") or {}
    address = d.get("address") or {}
    if isinstance(name, dict):
        display = name.get("short_with_opf") or name.get("full_with_opf") or s.get("value") or ""
    else:
        display = s.get("value") or str(name)
    return {
        "name": display,
        "inn": d.get("bin") or d.get("inn") or "",   # БИН
        "kpp": "",
        "ogrn": "",
        "legal_address": (address.get("unrestricted_value") or address.get("value")
                          if isinstance(address, dict) else "") or "",
        "industry": (f"ОКЭД {d.get('oked')}" if d.get("oked") else ""),
        "management": (d.get("management") or {}).get("name") if isinstance(d.get("management"), dict) else "",
        "status": ((d.get("state") or {}).get("status")) or "",
        "country": "KZ",
    }


def _fetch(method: str, key: str, query: str, count: int) -> list:
    """Один запрос к конкретному методу DaData. Ошибка -> пустой список."""
    try:
        r = httpx.post(
            f"{_DADATA_BASE}/{method}",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Token {key}",
            },
            json={"query": query, "count": count},
            timeout=8,
        )
        r.raise_for_status()
        return r.json().get("suggestions", []) or []
    except Exception:
        return []


@router.get("/suggest")
def suggest_company(
    request: Request,
    query: str = Query(..., min_length=2, max_length=200),
    country: str = Query("all", max_length=10),
    current=Depends(require_user),
):
    """Прокси к DaData. Без параметра country ищет и по РФ, и по КЗ и объединяет
    результаты — страна берётся из выбранной подсказки. Без ключа -> пустой
    список + configured=false (UI покажет ручной ввод).

    Требует авторизации и ограничен по частоте: за каждым запросом стоит платный
    вызов внешнего справочника. Открытый эндпоинт означал бы, что квоту DaData
    может израсходовать кто угодно.
    """
    ratelimit.check(ratelimit.SUGGEST, str(current.id))
    country = (country or "all").lower()
    if country not in ("all", "ru", "kz"):
        raise HTTPException(422, "Допустимые значения country: all, ru, kz")
    key = settings.dadata_api_key
    if not key:
        return {"configured": False, "suggestions": []}

    out = []
    # РФ (party) — основной справочник. Ошибка одного метода не мешает другому.
    if country in ("all", "ru"):
        for s in _fetch("party", key, query, 8):
            item = _norm_ru(s); item["raw"] = s
            out.append(item)
    # КЗ (party_kz) — если доступен на тарифе DaData; иначе просто пусто.
    if country in ("all", "kz"):
        for s in _fetch("party_kz", key, query, 8):
            item = _norm_kz(s); item["raw"] = s
            out.append(item)
    return {"configured": True, "suggestions": out}


def _company_dict(c: CompanyProfile) -> dict:
    return {
        "id": c.id, "team_id": c.team_id, "country": c.country, "source": c.source,
        "name": c.name, "inn": c.inn, "kpp": c.kpp, "ogrn": c.ogrn,
        "legal_address": c.legal_address, "industry": c.industry,
        "management": c.management, "status": c.status, "size": c.size,
    }


def _team_or_404(db: Session, team_id: int) -> Team:
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    return team


def _require_member(db: Session, team_id: int, user) -> Team:
    """Реквизиты компании видны только внутри своей команды."""
    team = _team_or_404(db, team_id)
    if team.team_lead_id == user.id:
        return team
    is_member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == user.id
    ).first()
    if not is_member:
        raise HTTPException(403, "Нет доступа к этой команде")
    return team


def _require_lead(db: Session, team_id: int, user) -> Team:
    """Реквизиты компании меняет только тимлид — это данные всей организации.
    Личность берём из токена, а не из параметра запроса: параметр подделывается.
    """
    team = _team_or_404(db, team_id)
    if team.team_lead_id != user.id:
        raise HTTPException(403, "Редактировать реквизиты компании может только тимлид команды")
    return team


@router.get("/by-team/{team_id}")
def get_company(team_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    team = _require_member(db, team_id, user)
    c = db.query(CompanyProfile).filter(CompanyProfile.team_id == team_id).first()
    return {"has_company": bool(team.has_company), "company": _company_dict(c) if c else None}


class CompanyIn(BaseModel):
    country: ShortStr = "RU"
    source: OptShortStr = None     # dadata | manual
    name: OptShortStr = None
    inn: OptShortStr = None
    kpp: OptShortStr = None
    ogrn: OptShortStr = None
    legal_address: OptTextStr = None
    industry: OptShortStr = None
    management: OptShortStr = None
    status: OptShortStr = None
    # Размер компании: верхняя граница отсекает заведомо невозможные значения,
    # по которым потом считается подсказка тарифа.
    size: Optional[Annotated[int, Field(ge=0, le=10_000_000)]] = None
    data: Optional[dict] = None    # сырой ответ DaData


@router.put("/by-team/{team_id}")
def upsert_company(team_id: int, payload: CompanyIn, db: Session = Depends(get_db),
                   user=Depends(require_user)):
    """Создать/обновить реквизиты компании пространства и выставить has_company.
    Требуется хотя бы название — иначе нечего сохранять.
    Доступ: только тимлид (проверка на сервере, а не скрытием формы)."""
    team = _require_lead(db, team_id, user)
    if not (payload.name and payload.name.strip()):
        raise HTTPException(400, "Название компании обязательно")

    c = db.query(CompanyProfile).filter(CompanyProfile.team_id == team_id).first()
    if not c:
        c = CompanyProfile(team_id=team_id)
        db.add(c)
    c.country = (payload.country or "RU").upper()[:2]
    c.source = payload.source or "manual"
    c.name = payload.name.strip()
    c.inn = (payload.inn or "").strip() or None
    c.kpp = (payload.kpp or "").strip() or None
    c.ogrn = (payload.ogrn or "").strip() or None
    c.legal_address = (payload.legal_address or "").strip() or None
    c.industry = (payload.industry or "").strip() or None
    c.management = (payload.management or "").strip() or None
    c.status = (payload.status or "").strip() or None
    c.size = payload.size if (payload.size and payload.size > 0) else None
    # Сырой ответ справочника кладём в JSON-колонку, но не доверяем ему слепо:
    # это внешние данные, которые клиент к тому же может подменить. Отсекаем
    # заведомо ненормальный объём, чтобы в базу не попал произвольный документ.
    raw = payload.data
    if raw is not None and len(json.dumps(raw, ensure_ascii=False)) > 20000:
        raise HTTPException(422, "Слишком большой объём данных справочника")
    c.data = raw
    team.has_company = True
    db.commit(); db.refresh(c)
    from app.services import audit
    audit.record(db, "company.updated", actor_id=user.id, entity_type="company",
                 entity_id=c.id, organization_id=team_id, category="general",
                 summary=f"Изменены реквизиты компании «{(c.name or '')[:60]}»",
                 meta={"country": c.country, "inn": c.inn})
    return {"has_company": True, "company": _company_dict(c)}


@router.delete("/by-team/{team_id}")
def delete_company(team_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    """Удалить реквизиты (Этап 4). Пространство продолжает работать без компании.
    Доступ: только тимлид."""
    team = _require_lead(db, team_id, user)
    c = db.query(CompanyProfile).filter(CompanyProfile.team_id == team_id).first()
    if c:
        db.delete(c)
    team.has_company = False
    db.commit()
    from app.services import audit
    audit.record(db, "company.deleted", actor_id=user.id, entity_type="company",
                 entity_id=team_id, organization_id=team_id, category="general",
                 summary="Удалены реквизиты компании")
    return {"has_company": False, "company": None}
