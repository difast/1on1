"""Онбординг-опросник + жёсткая блокировка входа до подтверждения почты.

1. users.onboarding_survey_done — флаг «опросник пройден или пропущен».
2. onboarding_survey_responses — ответы опросника (одна строка на пользователя).
3. Grandfathering: всем СУЩЕСТВУЮЩИМ пользователям с email проставляем
   email_confirmed = true. Иначе новая блокировка входа (auth.login) заперла бы
   уже работающие аккаунты, зарегистрированные до этой правки. Блокировка
   касается только новых регистраций, у которых email_confirmed = false с нуля.
"""
revision = '039'
down_revision = '038'

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column('users', sa.Column(
        'onboarding_survey_done', sa.Boolean(), nullable=False, server_default='false'))

    op.create_table(
        'onboarding_survey_responses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, unique=True, index=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='completed'),
        sa.Column('answers', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Grandfathering существующих аккаунтов — только тех, у кого есть email.
    op.execute("UPDATE users SET email_confirmed = true WHERE email IS NOT NULL")

    # Уже работающим пользователям (с выбранной ролью) опросник не показываем —
    # он для новых регистраций. Помечаем их как «прошедших».
    op.execute("UPDATE users SET onboarding_survey_done = true WHERE role IS NOT NULL AND role <> ''")


def downgrade():
    op.drop_table('onboarding_survey_responses')
    op.drop_column('users', 'onboarding_survey_done')
