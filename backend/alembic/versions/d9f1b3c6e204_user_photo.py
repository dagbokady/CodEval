"""user photo

Revision ID: d9f1b3c6e204
Revises: c4e8a2d7b513
Create Date: 2026-09-21 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9f1b3c6e204'
down_revision: Union[str, Sequence[str], None] = 'c4e8a2d7b513'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('photo', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'photo')
