"""Компания рабочего пространства (Этапы 2-4).

- Поиск по ИНН/БИН через DaData (прокси, ключ на сервере) — /companies/suggest.
- Реквизиты пространства (одна компания на команду) — CRUD /companies/by-team/{id}.

Ничего не блокирует: у пространства может не быть компании. Данные понадобятся
позже, на этапе оплаты. Ручной ввод — запасной вариант, если DaData не нашла.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import httpx

from app.database import get_db
from app.config import settings
from app.models.team import Team
from app.models.company import CompanyProfile

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


@router.get("/suggest")
def suggest_company(
    query: str = Query(..., min_length=2),
    country: str = Query("ru"),
):
    """Прокси к DaData. Возвращает нормализованные подсказки. Без ключа или при
    ошибке — пустой список + configured=false (UI покажет ручной ввод)."""
    country = (country or "ru").lower()
    if country not in _DADATA_METHOD:
        country = "ru"
    key = settings.dadata_api_key
    if not key:
        return {"configured": False, "suggestions": []}

    method = _DADATA_METHOD[country]
    try:
        r = httpx.post(
            f"{_DADATA_BASE}/{method}",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Token {key}",
            },
            json={"query": query, "count": 10},
            timeout=8,
        )
        r.raise_for_status()
        raw = r.json().get("suggestions", []) or []
    except Exception:
        # Не роняем UI — просто «не нашли», ручной ввод остаётся доступен.
        return {"configured": True, "suggestions": [], "error": True}

    norm = _norm_kz if country == "kz" else _norm_ru
    out = []
    for s in raw:
        item = norm(s)
        item["raw"] = s  # полный ответ — сохраним при выборе
        out.append(item)
    return {"configured": True, "suggestions": out}


def _company_dict(c: CompanyProfile) -> dict:
    return {
        "id": c.id, "team_id": c.team_id, "country": c.country, "source": c.source,
        "name": c.name, "inn": c.inn, "kpp": c.kpp, "ogrn": c.ogrn,
        "legal_address": c.legal_address, "industry": c.industry,
        "management": c.management, "status": c.status,
    }


@router.get("/by-team/{team_id}")
def get_company(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    c = db.query(CompanyProfile).filter(CompanyProfile.team_id == team_id).first()
    return {"has_company": bool(team.has_company), "company": _company_dict(c) if c else None}


class CompanyIn(BaseModel):
    country: str = "RU"
    source: Optional[str] = None   # dadata | manual
    name: Optional[str] = None
    inn: Optional[str] = None
    kpp: Optional[str] = None
    ogrn: Optional[str] = None
    legal_address: Optional[str] = None
    industry: Optional[str] = None
    management: Optional[str] = None
    status: Optional[str] = None
    data: Optional[dict] = None    # сырой ответ DaData


@router.put("/by-team/{team_id}")
def upsert_company(team_id: int, payload: CompanyIn, db: Session = Depends(get_db)):
    """Создать/обновить реквизиты компании пространства и выставить has_company.
    Требуется хотя бы название — иначе нечего сохранять."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
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
    c.data = payload.data
    team.has_company = True
    db.commit(); db.refresh(c)
    return {"has_company": True, "company": _company_dict(c)}


@router.delete("/by-team/{team_id}")
def delete_company(team_id: int, db: Session = Depends(get_db)):
    """Удалить реквизиты (Этап 4). Пространство продолжает работать без компании."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    c = db.query(CompanyProfile).filter(CompanyProfile.team_id == team_id).first()
    if c:
        db.delete(c)
    team.has_company = False
    db.commit()
    return {"has_company": False, "company": None}
