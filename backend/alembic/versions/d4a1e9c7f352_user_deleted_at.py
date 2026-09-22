"""user deleted_at

Revision ID: d4a1e9c7f352
Revises: b2e6f4a8c731
Create Date: 2026-09-22 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a1e9c7f352'
down_revision: Union[str, Sequence[str], None] = 'b2e6f4a8c731'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_deleted_at', 'users', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_users_deleted_at', table_name='users')
    op.drop_column('users', 'deleted_at')
