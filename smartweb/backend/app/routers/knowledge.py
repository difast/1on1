from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models.knowledge import KnowledgeArticle

router = APIRouter()

class ArticleCreate(BaseModel):
    team_id: int
    author_id: Optional[int] = None
    title: str
    content: Optional[str] = None

class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class ArticleOut(BaseModel):
    id: int
    team_id: int
    author_id: Optional[int]
    title: str
    content: Optional[str]
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

@router.get("/team/{team_id}", response_model=List[ArticleOut])
def list_articles(team_id: int, db: Session = Depends(get_db)):
    return db.query(KnowledgeArticle).filter(
        KnowledgeArticle.team_id == team_id
    ).order_by(KnowledgeArticle.created_at.desc()).all()

@router.post("/", response_model=ArticleOut)
def create_article(data: ArticleCreate, db: Session = Depends(get_db)):
    article = KnowledgeArticle(**data.model_dump())
    db.add(article)
    db.commit()
    db.refresh(article)
    return article

@router.patch("/{article_id}", response_model=ArticleOut)
def update_article(article_id: int, data: ArticleUpdate, db: Session = Depends(get_db)):
    article = db.query(KnowledgeArticle).filter(KnowledgeArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(article, k, v)
    db.commit()
    db.refresh(article)
    return article

@router.delete("/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(KnowledgeArticle).filter(KnowledgeArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(article)
    db.commit()
    return {"ok": True}
