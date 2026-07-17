"""Реквизиты компании рабочего пространства (Этап 3).

Привязаны к команде (team_id, один-к-одному). Заполнение необязательно — данные
понадобятся позже для оплаты; их отсутствие ничего не блокирует. Страна (country)
из ИНН/БИН — источник истины для будущего выбора платёжного провайдера.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.database import Base


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"),
                     nullable=False, unique=True)
    country = Column(String(2), nullable=False, default="RU")  # RU | KZ
    source = Column(String(20), nullable=True)                 # dadata | manual

    name = Column(String(500), nullable=True)
    inn = Column(String(20), nullable=True)          # ИНН (РФ) / БИН (КЗ)
    kpp = Column(String(20), nullable=True)
    ogrn = Column(String(20), nullable=True)         # ОГРН (РФ)
    legal_address = Column(String(1000), nullable=True)
    industry = Column(String(500), nullable=True)    # отрасль / ОКВЭД
    management = Column(String(500), nullable=True)  # руководитель
    size = Column(Integer, nullable=True)            # размер (сотрудников) — для рекомендации тарифа
    status = Column(String(50), nullable=True)       # ACTIVE / LIQUIDATED ...
    data = Column(JSON, nullable=True)               # полный ответ DaData

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    team = relationship("Team", back_populates="company")
