"""add usage columns to users

Revision ID: a1b2c3d4e5f6
Revises: 4c88ea24c849
Create Date: 2026-02-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '4c88ea24c849'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add usage_count and usage_reset_at columns to users table."""
    op.add_column('users', sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('usage_reset_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    """Remove usage_count and usage_reset_at columns from users table."""
    op.drop_column('users', 'usage_reset_at')
    op.drop_column('users', 'usage_count')
