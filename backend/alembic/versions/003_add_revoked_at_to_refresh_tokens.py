"""Adicionar coluna revoked_at na tabela refresh_tokens para grace period.

Revision ID: 003_add_revoked_at_to_refresh_tokens
Revises: 002_create_identity_schema
Create Date: 2026-10-01 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_add_revoked_at_to_refresh_tokens"
down_revision: str | None = "002_create_identity_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("refresh_tokens", "revoked_at")
