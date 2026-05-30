from alembic import op
import sqlalchemy as sa

revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None

def upgrade():
    # ticket messages
    op.create_table(
        'ticket_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ticket_id', sa.Integer(), sa.ForeignKey('support_tickets.id'), nullable=False),
        sa.Column('sender', sa.String(10), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    # unread reply flag on tickets
    op.add_column('support_tickets', sa.Column('has_unread_reply', sa.Boolean(), nullable=False, server_default='false'))
    # user block
    op.add_column('users', sa.Column('is_blocked', sa.Boolean(), nullable=False, server_default='false'))
    # KB admin flag + nullable team_id
    op.add_column('knowledge_articles', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.alter_column('knowledge_articles', 'team_id', nullable=True)

def downgrade():
    op.drop_column('knowledge_articles', 'is_admin')
    op.drop_column('users', 'is_blocked')
    op.drop_column('support_tickets', 'has_unread_reply')
    op.drop_table('ticket_messages')
