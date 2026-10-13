"""communauté : seuls les sujets ESATIC

Revision ID: a5d2f7c0e913
Revises: e7b3c9a1d406
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a5d2f7c0e913'
down_revision: Union[str, Sequence[str], None] = 'e7b3c9a1d406'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Retire de la communauté tout ce qui y est publié (les exercices des TD
    # d'algorithmique et le reste) : app.seed_community y republie ensuite les
    # trois sujets ESATIC. Suppression douce, rattrapable par deleted_at.
    op.execute(
        "UPDATE community_items SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    pass
