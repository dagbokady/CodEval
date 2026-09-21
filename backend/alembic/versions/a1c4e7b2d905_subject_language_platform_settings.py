"""subject language and author, platform settings

Revision ID: a1c4e7b2d905
Revises: f3b8d1a6c927
Create Date: 2026-09-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1c4e7b2d905'
down_revision: Union[str, Sequence[str], None] = 'f3b8d1a6c927'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'subjects',
        sa.Column('language', sa.String(length=30), nullable=False, server_default='c'),
    )
    op.add_column('subjects', sa.Column('author_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_subjects_author_id_users', 'subjects', 'users', ['author_id'], ['id']
    )
    op.create_index('ix_subjects_author_id', 'subjects', ['author_id'])
    # Les matières d'algorithmique existantes gardent leur nature.
    op.execute("UPDATE subjects SET language = 'algo' WHERE lower(name) LIKE '%algo%'")
    # `init_db` (create_all) a pu la créer au démarrage de l'API.
    if sa.inspect(op.get_bind()).has_table('platform_settings'):
        return
    op.create_table(
        'platform_settings',
        sa.Column('key', sa.String(length=60), primary_key=True),
        sa.Column(
            'value',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table('platform_settings')
    op.drop_index('ix_subjects_author_id', table_name='subjects')
    op.drop_constraint('fk_subjects_author_id_users', 'subjects', type_='foreignkey')
    op.drop_column('subjects', 'author_id')
    op.drop_column('subjects', 'language')
