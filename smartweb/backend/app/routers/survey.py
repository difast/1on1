"""Онбординг-опросник: конфиг вопросов, сохранение ответов и факт пропуска.

Показывается один раз — после подтверждения почты, до выбора роли. Доступ в
личный кабинет закрыт до подтверждения почты (см. auth.login), поэтому любой
дошедший сюда пользователь уже подтверждён — отдельной проверки email здесь нет.

Права: действия идут от имени самого пользователя (user_id). Если включён
AUTH_ENFORCE и есть текущий пользователь из токена — сверяем, что он не меняет
чужой опросник.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.onboarding_survey import OnboardingSurveyResponse
from app.schemas.user import UserOut
from app.utils.auth import get_current_user
from app.services.survey import SURVEY_QUESTIONS, sanitize_answers

router = APIRouter()


@router.get("/config")
def get_config():
    """Список вопросов и вариантов для отрисовки карточек (публичный конфиг)."""
    return {"questions": SURVEY_QUESTIONS}


class SubmitReq(BaseModel):
    user_id: int
    answers: dict = {}


class SkipReq(BaseModel):
    user_id: int


def _resolve_user(db: Session, current, user_id: int) -> User:
    user = current
    if user is None:
        user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    # Если пришёл авторизованный пользователь — он вправе менять только свой опросник.
    if current is not None and current.id != user_id:
        raise HTTPException(403, "Можно изменять только свой опросник")
    return user


def _upsert(db: Session, user: User, status: str, answers: dict) -> None:
    row = (
        db.query(OnboardingSurveyResponse)
        .filter(OnboardingSurveyResponse.user_id == user.id)
        .first()
    )
    if row is None:
        row = OnboardingSurveyResponse(user_id=user.id, status=status, answers=answers)
        db.add(row)
    else:
        row.status = status
        row.answers = answers
    # Флаг на пользователе: и «пройден», и «пропущен» — больше не показывать (3.6).
    user.onboarding_survey_done = True
    db.commit()
    db.refresh(user)


@router.post("/submit", response_model=UserOut)
def submit(data: SubmitReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Сохранить ответы опросника и пометить его пройденным."""
    user = _resolve_user(db, current, data.user_id)
    _upsert(db, user, "completed", sanitize_answers(data.answers))
    return user


@router.post("/skip", response_model=UserOut)
def skip(data: SkipReq, db: Session = Depends(get_db), current=Depends(get_current_user)):
    """Зафиксировать пропуск опросника (статус skipped, пустые ответы)."""
    user = _resolve_user(db, current, data.user_id)
    _upsert(db, user, "skipped", {})
    return user
