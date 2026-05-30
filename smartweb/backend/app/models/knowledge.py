from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, func
from app.database import Base

class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, nullable=True)
    author_id = Column(Integer, nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
