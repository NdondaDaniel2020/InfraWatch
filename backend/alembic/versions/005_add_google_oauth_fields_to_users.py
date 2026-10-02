"""Adicionar campos para login social Google OAuth na tabela users.

Revision ID: 005_add_google_oauth_fields_to_users
Revises: 004_create_notifications_table
Create Date: 2026-10-02 03:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_add_google_oauth_fields_to_users"
down_revision: str | None = "004_create_notifications_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column(
                "hashed_password",
                existing_type=sa.String(length=255),
                nullable=True,
            )
            batch_op.add_column(sa.Column("oauth_provider", sa.String(length=32), nullable=True))
            batch_op.add_column(sa.Column("google_id", sa.String(length=255), nullable=True))
            batch_op.create_index("idx_users_google_id", ["google_id"], unique=True)
    else:
        op.alter_column(
            "users",
            "hashed_password",
            existing_type=sa.String(length=255),
            nullable=True,
        )
        op.add_column("users", sa.Column("oauth_provider", sa.String(length=32), nullable=True))
        op.add_column("users", sa.Column("google_id", sa.String(length=255), nullable=True))
        op.create_index("idx_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_index("idx_users_google_id")
            batch_op.drop_column("google_id")
            batch_op.drop_column("oauth_provider")
            batch_op.alter_column(
                "hashed_password",
                existing_type=sa.String(length=255),
                nullable=False,
            )
    else:
        op.drop_index("idx_users_google_id", table_name="users")
        op.drop_column("users", "google_id")
        op.drop_column("users", "oauth_provider")
        op.alter_column(
            "users",
            "hashed_password",
            existing_type=sa.String(length=255),
            nullable=False,
        )
