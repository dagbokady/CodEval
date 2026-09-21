"""personal spaces and class join codes

Revision ID: c4e8a2d7b513
Revises: b7c3e1f09a21
Create Date: 2026-09-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e8a2d7b513'
down_revision: Union[str, Sequence[str], None] = 'b7c3e1f09a21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Les organisations existantes sont des établissements, sans limite.
    op.add_column('organizations', sa.Column('kind', sa.String(length=20), nullable=False,
                                             server_default='institution'))
    op.add_column('organizations', sa.Column('plan', sa.String(length=20), nullable=False,
                                             server_default='pro'))

    op.add_column('classrooms', sa.Column('join_code', sa.String(length=16), nullable=True))
    op.add_column('classrooms', sa.Column('join_code_expires_at', sa.DateTime(timezone=True),
                                          nullable=True))
    op.create_index('ix_classrooms_join_code', 'classrooms', ['join_code'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_classrooms_join_code', table_name='classrooms')
    op.drop_column('classrooms', 'join_code_expires_at')
    op.drop_column('classrooms', 'join_code')
    op.drop_column('organizations', 'plan')
    op.drop_column('organizations', 'kind')
