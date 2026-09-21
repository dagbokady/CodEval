"""community items

Revision ID: b7c3e1f09a21
Revises: ad4551ed4f5f
Create Date: 2026-09-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b7c3e1f09a21'
down_revision: Union[str, Sequence[str], None] = 'ad4551ed4f5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('community_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('item_type', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('language', sa.String(length=30), nullable=False),
        sa.Column('subject_name', sa.String(length=120), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('exercises_count', sa.Integer(), nullable=False),
        sa.Column('total_points', sa.Float(), nullable=False),
        sa.Column('uses', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['author_id'], ['users.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_community_items_organization_id', 'community_items', ['organization_id'])
    op.create_index('ix_community_items_author_id', 'community_items', ['author_id'])
    op.create_index('ix_community_type_created', 'community_items', ['item_type', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_community_type_created', table_name='community_items')
    op.drop_index('ix_community_items_author_id', table_name='community_items')
    op.drop_index('ix_community_items_organization_id', table_name='community_items')
    op.drop_table('community_items')
