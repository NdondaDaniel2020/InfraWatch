"""create_maintenance_windows_table

Revision ID: 011_create_maintenance_windows
Revises: 010_create_incidents
Create Date: 2026-10-10 01:38:00.000000

Cria a tabela de janelas de manutenção programada (maintenance_windows)
com chaves estrangeiras para devices e organizations, e índices por período.
"""


import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011_create_maintenance_windows"
down_revision: str | None = "010_create_incidents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "maintenance_windows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=True),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_approved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name=op.f("fk_maintenance_windows_device_id_devices"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_maintenance_windows_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_maintenance_windows")),
    )
    op.create_index(
        op.f("ix_maintenance_windows_device_id"),
        "maintenance_windows",
        ["device_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_maintenance_windows_organization_id"),
        "maintenance_windows",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_maintenance_windows_start_time"),
        "maintenance_windows",
        ["start_time"],
        unique=False,
    )
    op.create_index(
        op.f("ix_maintenance_windows_end_time"),
        "maintenance_windows",
        ["end_time"],
        unique=False,
    )
    op.create_index(
        op.f("ix_maintenance_windows_is_approved"),
        "maintenance_windows",
        ["is_approved"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_windows_device_period",
        "maintenance_windows",
        ["device_id", "start_time", "end_time"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_maintenance_windows_device_period", table_name="maintenance_windows")
    op.drop_index(op.f("ix_maintenance_windows_is_approved"), table_name="maintenance_windows")
    op.drop_index(op.f("ix_maintenance_windows_end_time"), table_name="maintenance_windows")
    op.drop_index(op.f("ix_maintenance_windows_start_time"), table_name="maintenance_windows")
    op.drop_index(op.f("ix_maintenance_windows_organization_id"), table_name="maintenance_windows")
    op.drop_index(op.f("ix_maintenance_windows_device_id"), table_name="maintenance_windows")
    op.drop_table("maintenance_windows")
