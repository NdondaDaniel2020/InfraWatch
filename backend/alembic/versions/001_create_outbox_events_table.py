"""Criar tabela outbox_events para o Transactional Outbox Pattern.

Revision ID: 001_create_outbox_events_table
Revises:
Create Date: 2026-10-01 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001_create_outbox_events_table"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tipo JSONB compatível com PostgreSQL e JSON genérico para outros bancos
json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("aggregate_id", sa.Uuid(), nullable=True),
        sa.Column("payload", json_type, nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outbox_events")),
    )
    op.create_index(
        "idx_outbox_pending_created",
        "outbox_events",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_outbox_aggregate",
        "outbox_events",
        ["aggregate_type", "aggregate_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_outbox_aggregate", table_name="outbox_events")
    op.drop_index("idx_outbox_pending_created", table_name="outbox_events")
    op.drop_table("outbox_events")
