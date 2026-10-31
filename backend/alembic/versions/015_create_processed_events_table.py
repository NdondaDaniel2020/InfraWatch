"""feat(database): criar tabela processed_events para deduplicacao de consumers

Revision ID: 015_create_processed_events_table
Revises: 014_create_topology_tables
Create Date: 2026-10-31 22:45:00.000000

Cria a tabela processed_events:
  - event_id: identificador único do evento recebido
  - consumer_name: identificador do consumidor que processou o evento
  - processed_at: timestamp UTC em que o processamento foi persistido
Chave primária composta (event_id, consumer_name) para garantir idempotência.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "015_create_processed_events_table"
down_revision = "014_create_topology_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("consumer_name", sa.String(100), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("event_id", "consumer_name", name="pk_processed_events"),
    )
    op.create_index(
        "idx_processed_events_processed_at",
        "processed_events",
        ["processed_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_processed_events_processed_at", table_name="processed_events")
    op.drop_table("processed_events")
