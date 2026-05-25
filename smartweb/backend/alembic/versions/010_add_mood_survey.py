from alembic import op
import sqlalchemy as sa

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('mood_entries', sa.Column('survey_text', sa.Text(), nullable=True))
    op.add_column('mood_entries', sa.Column('ai_summary', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('mood_entries', 'ai_summary')
    op.drop_column('mood_entries', 'survey_text')
