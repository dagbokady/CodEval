"""email verifications

Revision ID: b5d2f8e1c374
Revises: a1c4e7b2d905
Create Date: 2026-09-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5d2f8e1c374'
down_revision: Union[str, Sequence[str], None] = 'a1c4e7b2d905'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'email_verifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=190), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('ip', sa.String(length=64), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_email_verifications_email'), 'email_verifications', ['email'])
    op.create_index(op.f('ix_email_verifications_ip'), 'email_verifications', ['ip'])


def downgrade() -> None:
    op.drop_index(op.f('ix_email_verifications_ip'), table_name='email_verifications')
    op.drop_index(op.f('ix_email_verifications_email'), table_name='email_verifications')
    op.drop_table('email_verifications')
