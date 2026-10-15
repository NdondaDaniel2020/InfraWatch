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


def _is_postgresql() -> bool:
    """Verifica se o dialect é PostgreSQL."""
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def _is_sqlite() -> bool:
    """Verifica se o dialect é SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_postgresql():
        # PostgreSQL: usa AT TIME ZONE para converter
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
    elif _is_sqlite():
        # SQLite: usa batch_alter_table para recriar a tabela com novos tipos
        with op.batch_alter_table("devices") as batch_op:
            batch_op.alter_column(
                "created_at",
                existing_type=sa.DateTime(timezone=False),
                type_=sa.DateTime(timezone=True),
                existing_nullable=False,
                existing_server_default=sa.text("CURRENT_TIMESTAMP"),
            )
            batch_op.alter_column(
                "updated_at",
                existing_type=sa.DateTime(timezone=False),
                type_=sa.DateTime(timezone=True),
                existing_nullable=False,
                existing_server_default=sa.text("CURRENT_TIMESTAMP"),
            )
            batch_op.alter_column(
                "maintenance_until",
                existing_type=sa.DateTime(timezone=False),
                type_=sa.DateTime(timezone=True),
                existing_nullable=True,
            )
    else:
        # Outros dialects: alteração padrão
        op.alter_column(
            "devices",
            "created_at",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP"),
        )
        op.alter_column(
            "devices",
            "updated_at",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP"),
        )
        op.alter_column(
            "devices",
            "maintenance_until",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
        )


def downgrade() -> None:
    if _is_postgresql():
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
    elif _is_sqlite():
        # SQLite: usa batch_alter_table para recriar a tabela
        with op.batch_alter_table("devices") as batch_op:
            batch_op.alter_column(
                "maintenance_until",
                existing_type=sa.DateTime(timezone=True),
                type_=sa.DateTime(timezone=False),
                existing_nullable=True,
            )
            batch_op.alter_column(
                "updated_at",
                existing_type=sa.DateTime(timezone=True),
                type_=sa.DateTime(timezone=False),
                existing_nullable=False,
                existing_server_default=sa.text("CURRENT_TIMESTAMP"),
            )
            batch_op.alter_column(
                "created_at",
                existing_type=sa.DateTime(timezone=True),
                type_=sa.DateTime(timezone=False),
                existing_nullable=False,
                existing_server_default=sa.text("CURRENT_TIMESTAMP"),
            )
    else:
        op.alter_column(
            "devices",
            "maintenance_until",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(timezone=False),
            existing_nullable=True,
        )
        op.alter_column(
            "devices",
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(timezone=False),
            existing_nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP"),
        )
        op.alter_column(
            "devices",
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(timezone=False),
            existing_nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP"),
        )
