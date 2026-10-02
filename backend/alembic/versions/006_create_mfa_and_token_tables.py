"""Criar tabelas de MFA e tokens e adicionar colunas faltantes em users e refresh_tokens.

Revision ID: 006_create_mfa_and_token_tables
Revises: 005_add_google_oauth_fields_to_users
Create Date: 2026-10-02 04:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_create_mfa_and_token_tables"
down_revision: str | None = "005_add_google_oauth_fields_to_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # 1. Colunas adicionais na tabela users
    if is_sqlite:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False
                )
            )
            batch_op.add_column(
                sa.Column(
                    "mfa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False
                )
            )
            batch_op.add_column(sa.Column("mfa_type", sa.String(length=16), nullable=True))
    else:
        op.add_column(
            "users",
            sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )
        op.add_column(
            "users",
            sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )
        op.add_column(
            "users",
            sa.Column("mfa_type", sa.String(length=16), nullable=True),
        )

    # 2. Coluna device_name na tabela refresh_tokens
    if is_sqlite:
        with op.batch_alter_table("refresh_tokens") as batch_op:
            batch_op.add_column(sa.Column("device_name", sa.String(length=100), nullable=True))
    else:
        op.add_column(
            "refresh_tokens",
            sa.Column("device_name", sa.String(length=100), nullable=True),
        )

    # 3. Tabela password_reset_tokens
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_password_reset_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_reset_tokens")),
    )
    op.create_index(
        "ix_password_reset_tokens_token_hash",
        "password_reset_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_password_reset_tokens_user_id",
        "password_reset_tokens",
        ["user_id"],
        unique=False,
    )

    # 4. Tabela email_verification_tokens
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_email_verification_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_verification_tokens")),
    )
    op.create_index(
        "ix_email_verification_tokens_token_hash",
        "email_verification_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_email_verification_tokens_user_id",
        "email_verification_tokens",
        ["user_id"],
        unique=False,
    )

    # 5. Tabela mfa_methods
    op.create_table(
        "mfa_methods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=16), server_default="totp", nullable=False),
        sa.Column("secret", sa.String(length=512), nullable=True),
        sa.Column("metadata", json_type, nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_mfa_methods_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mfa_methods")),
    )
    op.create_index(
        "ix_mfa_methods_user_id",
        "mfa_methods",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_mfa_methods_user_type",
        "mfa_methods",
        ["user_id", "type"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # Drop mfa_methods
    op.drop_index("ix_mfa_methods_user_type", table_name="mfa_methods")
    op.drop_index("ix_mfa_methods_user_id", table_name="mfa_methods")
    op.drop_table("mfa_methods")

    # Drop email_verification_tokens
    op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_token_hash", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")

    # Drop password_reset_tokens
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    # Drop device_name from refresh_tokens
    if is_sqlite:
        with op.batch_alter_table("refresh_tokens") as batch_op:
            batch_op.drop_column("device_name")
    else:
        op.drop_column("refresh_tokens", "device_name")

    # Drop columns from users
    if is_sqlite:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("mfa_type")
            batch_op.drop_column("mfa_enabled")
            batch_op.drop_column("is_verified")
    else:
        op.drop_column("users", "mfa_type")
        op.drop_column("users", "mfa_enabled")
        op.drop_column("users", "is_verified")
