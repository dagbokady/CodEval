"""user sheet header

Revision ID: f3b8d1a6c927
Revises: e2a7c5d9f318
Create Date: 2026-09-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f3b8d1a6c927'
down_revision: Union[str, Sequence[str], None] = 'e2a7c5d9f318'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'sheet_header',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'sheet_header')
