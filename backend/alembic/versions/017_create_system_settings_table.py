"""feat(database): criar tabela system_settings para configuracoes dinamicas

Revision ID: 017_create_system_settings_table
Revises: 016_add_next_retry_at_to_outbox_events
Create Date: 2026-11-12 18:30:00.000000

Cria a tabela system_settings para persistir configuracoes dinamicas de integracoes
(GLPI, Zabbix, WhatsApp, SMTP, Webhooks) com suporte a campos criptografados,
rastreabilidade de alteracao e indices por categoria.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "017_create_system_settings_table"
down_revision = "016_add_next_retry_at_to_outbox_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=100), primary_key=True, nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL", name=op.f("fk_system_settings_updated_by_users")),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_system_settings")),
    )
    op.create_index(
        "idx_system_settings_category",
        "system_settings",
        ["category"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_system_settings_category", table_name="system_settings")
    op.drop_table("system_settings")
