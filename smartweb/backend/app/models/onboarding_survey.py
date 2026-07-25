"""Ответы онбординг-опросника (после подтверждения почты).

Одна строка на пользователя (user_id уникален): опросник показывается один раз.
status фиксирует, прошёл пользователь опросник или пропустил его —
именно факт пропуска, а не пустой ответ (Задача 3.4). Выбранные варианты
хранятся в JSON: { question_key: [option_key, ...] } — так список вопросов и
вариантов можно менять в конфиге (app/services/survey.py) без миграции БД.
"""
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, func
from app.database import Base


class OnboardingSurveyResponse(Base):
    __tablename__ = "onboarding_survey_responses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     unique=True, nullable=False, index=True)
    # "completed" | "skipped"
    status = Column(String(20), nullable=False, default="completed")
    # { question_key: [option_key, ...] }. У пропуска — пустой словарь.
    answers = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
