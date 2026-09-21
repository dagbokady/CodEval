"""soft delete

Revision ID: c7e4a9d2b518
Revises: b5d2f8e1c374
Create Date: 2026-09-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7e4a9d2b518'
down_revision: Union[str, None] = 'b5d2f8e1c374'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("subjects", "classrooms", "evaluations", "exercises", "bank_exercises",
          "community_items")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
