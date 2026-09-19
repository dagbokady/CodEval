"""initial schema

Revision ID: ad4551ed4f5f
Revises:
Create Date: 2026-09-19 10:24:15.662109

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ad4551ed4f5f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('password_reset_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_password_reset_tokens_token', 'password_reset_tokens', ['token'], unique=True)
    op.create_index('ix_password_reset_tokens_user_id', 'password_reset_tokens', ['user_id'])

    # Colonnes legacy ajoutées en TEXT par _ADDED_COLUMNS : les mettre en conformité.
    for table in ('test_cases', 'bank_test_cases'):
        op.alter_column(table, 'input_types', existing_type=sa.TEXT(), nullable=False,
                        server_default=sa.text("'[]'"))
        op.alter_column(table, 'expected_type', existing_type=sa.VARCHAR(20), nullable=False,
                        server_default=sa.text("'string'"))
        op.alter_column(table, 'args', existing_type=sa.TEXT(), nullable=False,
                        server_default=sa.text("'[]'"))

    op.alter_column('evaluations', 'is_template', existing_type=sa.BOOLEAN(), nullable=False,
                    existing_server_default=sa.text('false'))


def downgrade() -> None:
    for table in ('test_cases', 'bank_test_cases'):
        op.alter_column(table, 'args', existing_type=sa.TEXT(), nullable=True, server_default=None)
        op.alter_column(table, 'expected_type', existing_type=sa.VARCHAR(20), nullable=True, server_default=None)
        op.alter_column(table, 'input_types', existing_type=sa.TEXT(), nullable=True, server_default=None)

    op.alter_column('evaluations', 'is_template', existing_type=sa.BOOLEAN(), nullable=True,
                    existing_server_default=sa.text('false'))

    op.drop_index('ix_password_reset_tokens_user_id', table_name='password_reset_tokens')
    op.drop_index('ix_password_reset_tokens_token', table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
