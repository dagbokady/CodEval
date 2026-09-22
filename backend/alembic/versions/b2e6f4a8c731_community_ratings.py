"""community ratings

Revision ID: b2e6f4a8c731
Revises: a8d3f5c1e742
Create Date: 2026-09-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b2e6f4a8c731'
down_revision: Union[str, Sequence[str], None] = 'a8d3f5c1e742'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'community_ratings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('community_items.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('stars', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('item_id', 'user_id', name='uq_community_rating'),
    )
    op.create_index('ix_community_ratings_item_id', 'community_ratings', ['item_id'])
    op.create_index('ix_community_ratings_user_id', 'community_ratings', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_community_ratings_user_id', table_name='community_ratings')
    op.drop_index('ix_community_ratings_item_id', table_name='community_ratings')
    op.drop_table('community_ratings')
