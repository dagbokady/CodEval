"""partage depuis la banque, communauté remise à neuf

Revision ID: a6d2f9c4e185
Revises: e7b3c9a1d406
Create Date: 2026-10-13 15:00:00.000000

Le partage passe désormais par la communauté, avec une portée (toute la
plateforme ou l'établissement) et un lien vers l'original de la banque.

La communauté repart à neuf : toutes les publications existantes sont retirées
(suppression douce : `deleted_at` renseigné, rien n'est effacé), et le
démarrage (app.seed_community) y publie les sujets de référence. L'ancien
drapeau « partager avec mes collègues » des exercices de la banque est remis à
faux : le partage se règle maintenant depuis Ma banque.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a6d2f9c4e185'
down_revision: Union[str, Sequence[str], None] = 'e7b3c9a1d406'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('community_items', sa.Column(
        'visibility', sa.String(20), nullable=False, server_default='all'))
    op.add_column('community_items', sa.Column('source_type', sa.String(20), nullable=True))
    op.add_column('community_items', sa.Column('source_id', sa.Integer(), nullable=True))
    op.create_index('ix_community_source', 'community_items', ['source_type', 'source_id'])

    op.execute("UPDATE community_items SET deleted_at = now() WHERE deleted_at IS NULL")
    op.execute("UPDATE bank_exercises SET is_shared = false WHERE is_shared")


def downgrade() -> None:
    # Les publications retirées le restent : leur `deleted_at` dit quand.
    op.drop_index('ix_community_source', table_name='community_items')
    op.drop_column('community_items', 'source_id')
    op.drop_column('community_items', 'source_type')
    op.drop_column('community_items', 'visibility')
