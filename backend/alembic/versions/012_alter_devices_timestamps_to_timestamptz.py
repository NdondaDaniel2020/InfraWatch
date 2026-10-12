"""alter_devices_timestamps_to_timestamptz

Revision ID: 012_alter_devices_timestamps
Revises: 011_create_maintenance_windows
Create Date: 2026-10-12 17:15:00.000000

Padroniza as colunas de data/hora da tabela 'devices' para TIMESTAMPTZ (timestamp with time zone),
alinhando o inventário ao padrão global do sistema (incidents, metrics, users, maintenance_windows).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012_alter_devices_timestamps"
down_revision: str | None = "011_create_maintenance_windows"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "devices",
        "created_at",
        existing_type=sa.DateTime(timezone=False),
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "devices",
        "updated_at",
        existing_type=sa.DateTime(timezone=False),
        type_=sa.DateTime(timezone=True),
        postgresql_using="updated_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "devices",
        "maintenance_until",
        existing_type=sa.DateTime(timezone=False),
        type_=sa.DateTime(timezone=True),
        postgresql_using="maintenance_until AT TIME ZONE 'UTC'",
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "devices",
        "maintenance_until",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(timezone=False),
        postgresql_using="maintenance_until AT TIME ZONE 'UTC'",
        existing_nullable=True,
    )
    op.alter_column(
        "devices",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(timezone=False),
        postgresql_using="updated_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "devices",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(timezone=False),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
