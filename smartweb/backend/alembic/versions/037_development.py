"""Модуль «Развитие»: навыки, уровни с историей, план развития, рекомендации.
Расширение модели целей: goals.goal_kind, goals.skill_id; goal_comments.step_id
(+ goal_id становится nullable для переиспользования комментариев в развитии).

Аддитивно и идемпотентно.
"""
from alembic import op
import sqlalchemy as sa

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'skills' not in tables:
        op.create_table(
            'skills',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('category', sa.String(30), server_default='technical', nullable=False),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_skills_team_id', 'skills', ['team_id'])

    if 'user_skills' not in tables:
        op.create_table(
            'user_skills',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id'), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
            sa.Column('current_level', sa.Integer(), server_default='1', nullable=False),
            sa.Column('desired_level', sa.Integer(), nullable=True),
            sa.Column('target_date', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_user_skills_user_id', 'user_skills', ['user_id'])

    if 'skill_level_history' not in tables:
        op.create_table(
            'skill_level_history',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_skill_id', sa.Integer(), sa.ForeignKey('user_skills.id', ondelete='CASCADE'), nullable=False),
            sa.Column('level', sa.Integer(), nullable=False),
            sa.Column('changed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('changed_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_skill_level_history_user_skill_id', 'skill_level_history', ['user_skill_id'])

    if 'development_steps' not in tables:
        op.create_table(
            'development_steps',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id'), nullable=True),
            sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goals.id'), nullable=True),
            sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=True),
            sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id'), nullable=True),
            sa.Column('due_date', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), server_default='not_started', nullable=False),
            sa.Column('progress', sa.Integer(), server_default='0', nullable=False),
            sa.Column('assigned_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_development_steps_user_id', 'development_steps', ['user_id'])

    if 'development_recommendations' not in tables:
        op.create_table(
            'development_recommendations',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id'), nullable=True),
            sa.Column('source', sa.String(20), server_default='rule', nullable=False),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('body', sa.Text(), nullable=True),
            sa.Column('article_id', sa.Integer(), sa.ForeignKey('knowledge_articles.id'), nullable=True),
            sa.Column('target_level', sa.Integer(), nullable=True),
            sa.Column('target_date', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), server_default='new', nullable=False),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_development_recommendations_user_id', 'development_recommendations', ['user_id'])

    # Расширение целей под учебные цели и связь с навыком.
    goal_cols = {c['name'] for c in insp.get_columns('goals')} if 'goals' in tables else set()
    if 'goals' in tables and 'goal_kind' not in goal_cols:
        op.add_column('goals', sa.Column('goal_kind', sa.String(20), server_default='standard', nullable=False))
    if 'goals' in tables and 'skill_id' not in goal_cols:
        op.add_column('goals', sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id'), nullable=True))

    # Переиспользование комментариев целей для шагов развития.
    gc_cols = {c['name'] for c in insp.get_columns('goal_comments')} if 'goal_comments' in tables else set()
    if 'goal_comments' in tables and 'step_id' not in gc_cols:
        op.add_column('goal_comments', sa.Column('step_id', sa.Integer(), sa.ForeignKey('development_steps.id', ondelete='CASCADE'), nullable=True))
        op.create_index('ix_goal_comments_step_id', 'goal_comments', ['step_id'])
    # goal_id делаем nullable (для комментариев, привязанных к шагу). На SQLite
    # ALTER для изменения nullable недоступен — пропускаем (там и так nullable-семантика).
    if 'goal_comments' in tables and bind.dialect.name != 'sqlite':
        try:
            op.alter_column('goal_comments', 'goal_id', existing_type=sa.Integer(), nullable=True)
        except Exception:
            pass


def downgrade():
    pass
