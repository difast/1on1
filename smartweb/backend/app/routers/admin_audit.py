"""Вкладка «Логи» внутренней владельческой админ-панели (Блок 8, Этап 5).

Только для владельческого аккаунта — тот же гвард require_admin, что и у всей
внутренней админ-панели (клиентской админ-панели не существует). Отдаёт записи
единого журнала аудита с фильтрацией и пагинацией + сводку подозрительной
активности.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog, AUDIT_CATEGORIES
from app.models.user import User
from app.utils.auth import require_admin
from app.services import audit

router = APIRouter()


def _row(a: AuditLog, actor_name: Optional[str]) -> dict:
    return {
        "id": a.id,
        "actor_id": a.actor_id,
        "actor_name": actor_name,
        "action_type": a.action_type,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "organization_id": a.organization_id,
        "category": a.category,
        "summary": a.summary,
        "ip": a.ip,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


@router.get("")
@router.get("/")
def list_audit(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
    category: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    actor_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Список записей журнала с фильтрами и пагинацией (без выгрузки всего разом)."""
    q = db.query(AuditLog)
    if category and category in AUDIT_CATEGORIES:
        q = q.filter(AuditLog.category == category)
    if action_type:
        q = q.filter(AuditLog.action_type == action_type)
    if actor_id is not None:
        q = q.filter(AuditLog.actor_id == actor_id)
    if organization_id is not None:
        q = q.filter(AuditLog.organization_id == organization_id)
    df = _parse_dt(date_from)
    if df:
        q = q.filter(AuditLog.created_at >= df)
    dt = _parse_dt(date_to)
    if dt:
        q = q.filter(AuditLog.created_at <= dt)

    total = q.count()
    rows = q.order_by(AuditLog.id.desc()).offset(offset).limit(limit).all()

    # Имена акторов одним запросом.
    ids = {r.actor_id for r in rows if r.actor_id}
    names = {}
    if ids:
        names = {u.id: u.name for u in db.query(User.id, User.name).filter(User.id.in_(ids)).all()}

    return {
        "items": [_row(r, names.get(r.actor_id)) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "categories": list(AUDIT_CATEGORIES),
    }


@router.get("/security-summary")
def security_summary(_admin=Depends(require_admin)):
    """Текущая агрегация подозрительной активности (окно мониторинга)."""
    return audit.suspicious_summary()


@router.get("/{log_id}")
def get_audit(log_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Детальный просмотр записи, включая полный (уже отредактированный) meta-diff."""
    a = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    actor_name = None
    if a.actor_id:
        u = db.query(User.name).filter(User.id == a.actor_id).first()
        actor_name = u[0] if u else None
    out = _row(a, actor_name)
    out["meta"] = a.meta  # meta уже прошёл редакцию при записи (без секретов)
    return out
