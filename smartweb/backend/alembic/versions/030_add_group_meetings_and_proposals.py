"""Групповые созвоны (Задача 4) и предложения встреч (Задача 5).

Аддитивно: колонка meetings.group_id + новые таблицы meeting_proposals и
meeting_proposal_events. Существующие встречи 1-на-1 не затрагиваются
(group_id = NULL), формат 1-на-1 продолжает работать без изменений.
"""
from alembic import op
import sqlalchemy as sa

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade():
    # Идемпотентно: не падаем, если объект уже существует (частично применённая
    # схема), иначе цепочка миграций застревает и новые колонки не появляются.
    insp = sa.inspect(op.get_bind())
    existing_tables = set(insp.get_table_names())
    mtg_cols = {c['name'] for c in insp.get_columns('meetings')}
    mtg_idx = {i['name'] for i in insp.get_indexes('meetings')}
    if 'group_id' not in mtg_cols:
        op.add_column('meetings', sa.Column('group_id', sa.String(64), nullable=True))
    if 'ix_meetings_group_id' not in mtg_idx:
        op.create_index('ix_meetings_group_id', 'meetings', ['group_id'])

    if 'meeting_proposals' in existing_tables:
        return  # таблицы предложений уже есть — миграция уже проходила

    op.create_table(
        'meeting_proposals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
        sa.Column('from_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('to_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('topic', sa.String(500), nullable=True),
        sa.Column('proposed_time', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('awaiting_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('last_actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_meeting_proposals_from_user_id', 'meeting_proposals', ['from_user_id'])
    op.create_index('ix_meeting_proposals_to_user_id', 'meeting_proposals', ['to_user_id'])

    op.create_table(
        'meeting_proposal_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('proposal_id', sa.Integer(), sa.ForeignKey('meeting_proposals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('proposed_time', sa.DateTime(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_meeting_proposal_events_proposal_id', 'meeting_proposal_events', ['proposal_id'])


def downgrade():
    op.drop_index('ix_meeting_proposal_events_proposal_id', 'meeting_proposal_events')
    op.drop_table('meeting_proposal_events')
    op.drop_index('ix_meeting_proposals_to_user_id', 'meeting_proposals')
    op.drop_index('ix_meeting_proposals_from_user_id', 'meeting_proposals')
    op.drop_table('meeting_proposals')
    op.drop_index('ix_meetings_group_id', 'meetings')
    op.drop_column('meetings', 'group_id')
