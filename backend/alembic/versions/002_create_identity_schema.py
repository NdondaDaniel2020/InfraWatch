"""Criar esquema relacional de identidade, multitenancy e trilha de auditoria.

Revision ID: 002_create_identity_schema
Revises: 001_create_outbox_events_table
Create Date: 2026-10-01 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_create_identity_schema"
down_revision: str | None = "001_create_outbox_events_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    # 1. Tabela organizations (Multi-tenancy)
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column(
            "sla_target_default",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="99.50",
        ),
        sa.Column("tier", sa.String(length=30), nullable=False, server_default="STANDARD"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
        sa.UniqueConstraint("slug", name=op.f("uq_organizations_slug")),
    )
    op.create_index("idx_organizations_slug", "organizations", ["slug"], unique=True)

    # 2. Tabela users (Identidade e RBAC com escopo de Tenant)
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False, server_default="CLIENT_VIEWER"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_users_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index("idx_users_email", "users", ["email"], unique=True)
    op.create_index("idx_users_organization_id", "users", ["organization_id"], unique=False)

    # 3. Tabela refresh_tokens (Controle e Rotação de Tokens de Sessão)
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("replaced_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index("idx_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("idx_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index(
        "idx_refresh_tokens_lookup",
        "refresh_tokens",
        ["token_hash", "is_revoked", "expires_at"],
        unique=False,
    )

    # 4. Tabela audit_logs (Trilha de Auditoria Imutável Append-Only)
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("result", sa.String(length=16), nullable=False, server_default="SUCCESS"),
        sa.Column("details", json_type, nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("previous_hash", sa.String(length=64), nullable=True),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_audit_logs_organization_id_organizations"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_actor_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index("idx_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"], unique=False)
    op.create_index(
        "idx_audit_logs_organization_id", "audit_logs", ["organization_id"], unique=False
    )
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("idx_audit_logs_hash", "audit_logs", ["hash"], unique=False)

    # Triggers de bloqueio de mutações (Imutabilidade em banco)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("""
            CREATE OR REPLACE FUNCTION block_audit_log_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'A tabela audit_logs é append-only. Operações de UPDATE ou DELETE são proibidas.';
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute("""
            CREATE TRIGGER prevent_audit_log_mutation
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW
            EXECUTE FUNCTION block_audit_log_mutation();
        """)
    elif bind.dialect.name == "sqlite":
        op.execute("""
            CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'A tabela audit_logs é append-only. Operações de UPDATE são proibidas.');
            END;
        """)
        op.execute("""
            CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'A tabela audit_logs é append-only. Operações de DELETE são proibidas.');
            END;
        """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS prevent_audit_log_mutation ON audit_logs;")
        op.execute("DROP FUNCTION IF EXISTS block_audit_log_mutation();")
    elif bind.dialect.name == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS prevent_audit_log_update;")
        op.execute("DROP TRIGGER IF EXISTS prevent_audit_log_delete;")

    # Drop audit_logs
    op.drop_index("idx_audit_logs_hash", table_name="audit_logs")
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("idx_audit_logs_organization_id", table_name="audit_logs")
    op.drop_index("idx_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    # Drop refresh_tokens
    op.drop_index("idx_refresh_tokens_lookup", table_name="refresh_tokens")
    op.drop_index("idx_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("idx_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    # Drop users
    op.drop_index("idx_users_organization_id", table_name="users")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")

    # Drop organizations
    op.drop_index("idx_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
