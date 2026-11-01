"""feat(database): adicionar coluna next_retry_at e indice composto em outbox_events

Revision ID: 016_add_next_retry_at_to_outbox_events
Revises: 015_create_processed_events_table
Create Date: 2026-11-01 01:20:00.000000

Adiciona coluna next_retry_at na tabela outbox_events para controle de backoff exponencial
e cria índice composto ix_outbox_status_next_retry sobre (status, next_retry_at).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "016_add_next_retry_at_to_outbox_events"
down_revision = "015_create_processed_events_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "outbox_events",
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_outbox_status_next_retry",
        "outbox_events",
        ["status", "next_retry_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_status_next_retry", table_name="outbox_events")
    op.drop_column("outbox_events", "next_retry_at")
