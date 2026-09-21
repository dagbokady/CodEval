"""classroom owner and sharing

Revision ID: a8d3f5c1e742
Revises: c7e4a9d2b518
Create Date: 2026-09-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a8d3f5c1e742'
down_revision: Union[str, Sequence[str], None] = 'c7e4a9d2b518'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('classrooms', sa.Column('owner_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_classrooms_owner_id_users', 'classrooms', 'users', ['owner_id'], ['id']
    )
    op.create_table(
        'classroom_shares',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('classroom_id', sa.Integer(), sa.ForeignKey('classrooms.id'), nullable=False),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('invited_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('classroom_id', 'teacher_id', name='uq_classroom_share'),
    )
    op.create_index('ix_classroom_shares_classroom_id', 'classroom_shares', ['classroom_id'])
    op.create_index('ix_classroom_shares_teacher_id', 'classroom_shares', ['teacher_id'])


def downgrade() -> None:
    op.drop_index('ix_classroom_shares_teacher_id', table_name='classroom_shares')
    op.drop_index('ix_classroom_shares_classroom_id', table_name='classroom_shares')
    op.drop_table('classroom_shares')
    op.drop_constraint('fk_classrooms_owner_id_users', 'classrooms', type_='foreignkey')
    op.drop_column('classrooms', 'owner_id')
