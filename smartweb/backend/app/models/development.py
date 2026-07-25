"""Модуль «Развитие»: навыки сотрудника, текущий/желаемый уровень с историей,
индивидуальный план развития (шаги) и рекомендации. Строится по тем же
принципам, что и модуль «Цели»: единая шкала/статусы в конфигурации, числовой
прогресс, права на бэкенде, переиспользование системы комментариев (GoalComment)
и уведомлений.

Учебные цели (1.6) НЕ выделены в отдельную сущность — это подтип существующей
модели Goal (goal_kind='learning', + skill_id). Так «Цели» и «Развитие» работают
в одной модели целей, без двух независимых списков.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.database import Base

# ── Конфигурация (единый источник; фронтенд повторяет те же значения) ──────────

# Категории навыков (справочник сопоставим между людьми, а не свободный текст).
SKILL_CATEGORIES = ("technical", "product", "communication", "management")

# Единая шкала уровней 1..5 с текстовыми названиями. Вынесена в конфигурацию —
# используется и в истории, и в разрыве current/desired, и в аналитике.
SKILL_LEVELS = {
    1: "Новичок",
    2: "Базовый",
    3: "Уверенный",
    4: "Продвинутый",
    5: "Эксперт",
}
SKILL_LEVEL_MIN = 1
SKILL_LEVEL_MAX = 5

# Статусы шага плана развития и переходы. Прогресс плана считается из статусов.
DEV_STEP_STATUSES = ("not_started", "in_progress", "done", "cancelled")
DEV_STEP_OPEN_STATUSES = ("not_started", "in_progress")

# Источники рекомендаций: правила (детерминированные), тимлид, база знаний, AI (Пит).
DEV_REC_SOURCES = ("rule", "lead", "knowledge", "ai")
DEV_REC_STATUSES = ("new", "accepted", "dismissed")


class Skill(Base):
    """Справочник навыков на уровне команды (team_id) или компании (team_id=NULL).
    Позволяет сопоставлять навыки между людьми, а не хранить свободный текст."""
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)  # NULL = общий
    name = Column(String(200), nullable=False)
    category = Column(String(30), nullable=False, default="technical", server_default="technical")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class UserSkill(Base):
    """Навык конкретного сотрудника: текущий и желаемый уровень + срок. Разрыв
    (gap = desired - current) считается на лету и лежит в основе плана и
    рекомендаций."""
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    current_level = Column(Integer, nullable=False, default=1, server_default="1")
    desired_level = Column(Integer, nullable=True)
    target_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    skill = relationship("Skill", foreign_keys=[skill_id])
    history = relationship(
        "SkillLevelHistory", back_populates="user_skill",
        cascade="all, delete-orphan", order_by="SkillLevelHistory.id",
    )


class SkillLevelHistory(Base):
    """История изменения текущего уровня навыка — чтобы был виден рост во времени."""
    __tablename__ = "skill_level_history"

    id = Column(Integer, primary_key=True)
    user_skill_id = Column(Integer, ForeignKey("user_skills.id", ondelete="CASCADE"), nullable=False, index=True)
    level = Column(Integer, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(Text, nullable=True)
    changed_at = Column(DateTime, server_default=func.now())

    user_skill = relationship("UserSkill", back_populates="history")


class DevelopmentStep(Base):
    """Шаг индивидуального плана развития. Может быть связан с навыком, а также с
    задачей / встречей / целью. Если связан с целью (goal_id), прогресс шага
    зеркалит прогресс цели (единый источник — цель), см. development_sync."""
    __tablename__ = "development_steps"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # чей план
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)      # связанная цель
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)      # связанная задача
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)  # связанная встреча
    due_date = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="not_started", server_default="not_started")
    progress = Column(Integer, nullable=False, default=0, server_default="0")  # 0..100
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # кто назначил (сам/тимлид)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    skill = relationship("Skill", foreign_keys=[skill_id])


class DevelopmentRecommendation(Base):
    """Рекомендация по развитию. Источник:
      rule      — детерминированное правило (разрыв уровней, застой, срок);
      lead      — направление роста, назначенное тимлидом (с target_level/date);
      knowledge — материал базы знаний под навык;
      ai        — персональная подсказка ассистента Пит.
    Рекомендацию можно принять (accepted → превращается в шаг плана) или
    отклонить (dismissed)."""
    __tablename__ = "development_recommendations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # получатель
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)
    source = Column(String(20), nullable=False, default="rule", server_default="rule")
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    article_id = Column(Integer, ForeignKey("knowledge_articles.id"), nullable=True)  # для knowledge
    target_level = Column(Integer, nullable=True)   # для направления роста тимлида
    target_date = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="new", server_default="new")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # тимлид для source=lead
    created_at = Column(DateTime, server_default=func.now())

    skill = relationship("Skill", foreign_keys=[skill_id])
