"""communauté : seulement les sujets complets

Revision ID: a5d2f7c0e913
Revises: a6d2f9c4e185
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a5d2f7c0e913'
down_revision: Union[str, Sequence[str], None] = 'a6d2f9c4e185'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # La communauté ne montre plus que des sujets complets : on retire tout ce
    # qui y est publié (exercices seuls compris, s'ils ont déjà été semés), puis
    # app.seed_community republie les trois sujets ESATIC. Suppression douce,
    # rattrapable par deleted_at.
    op.execute(
        "UPDATE community_items SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    pass
