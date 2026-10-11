"""test argv

Revision ID: e7b3c9a1d406
Revises: d4a1e9c7f352
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e7b3c9a1d406'
down_revision: Union[str, Sequence[str], None] = 'd4a1e9c7f352'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')


def upgrade() -> None:
    # Arguments de la ligne de commande d'un test : « ./programme 40 ».
    for table in ('test_cases', 'bank_test_cases'):
        op.add_column(table, sa.Column('argv', _JSON, nullable=False, server_default='[]'))


def downgrade() -> None:
    for table in ('test_cases', 'bank_test_cases'):
        op.drop_column(table, 'argv')
