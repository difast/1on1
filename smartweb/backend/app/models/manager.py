from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database import Base


class Manager(Base):
    """Реестр сотрудников (выделенных менеджеров): заводятся вручную в
    админ-панели, назначаются пользователям из списка. Вкладка «Сотрудники»
    (задача 2) — полный CRUD над этим же реестром: роль, контакты, зона
    ответственности. Отдельной параллельной системы нет."""
    __tablename__ = "managers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    contact = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    # Роль сотрудника согласована с ролевой моделью продукта (см. STAFF_ROLES):
    # admin — полный доступ, manager — работа с клиентами, support — поддержка.
    role = Column(String(50), nullable=False, server_default="manager", default="manager")
    responsibility = Column(Text, nullable=True)  # зона ответственности
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


# Роли сотрудников. Пересекаются с ролевой моделью продукта (role='admin'
# существует и у пользователей) — единый словарь, не параллельная система.
STAFF_ROLES = ("admin", "manager", "support")
