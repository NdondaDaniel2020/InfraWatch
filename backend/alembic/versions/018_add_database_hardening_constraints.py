"""feat(database): adicionar check constraints de integridade e hardening

Revision ID: 018_add_database_hardening_constraints
Revises: 017_create_system_settings_table
Create Date: 2026-11-25 12:00:00.000000

Aplica constraints no nível de banco de dados (Checklist Hardening Ponto 4):
- metrics: packet_loss entre 0.0 e 100.0
- devices: interval_seconds entre 5 e 86400
- maintenance_windows: end_time >= start_time
- incidents: resolved_at IS NULL OR resolved_at >= started_at
- organizations: sla_target_default entre 50.00 e 100.00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "018_add_database_hardening_constraints"
down_revision = "017_create_system_settings_table"
branch_labels = None
depends_on = None


def _is_sqlite() -> bool:
    """Verifica se o dialect ativo é SQLite."""
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        return

    op.create_check_constraint(
        "chk_metric_packet_loss",
        "metrics",
        "packet_loss >= 0.0 AND packet_loss <= 100.0",
    )
    op.create_check_constraint(
        "chk_device_interval_seconds",
        "devices",
        "interval_seconds >= 5 AND interval_seconds <= 86400",
    )
    op.create_check_constraint(
        "chk_maint_valid_window",
        "maintenance_windows",
        "end_time >= start_time",
    )
    op.create_check_constraint(
        "chk_incident_dates_coherent",
        "incidents",
        "resolved_at IS NULL OR resolved_at >= started_at",
    )
    op.create_check_constraint(
        "chk_org_sla_target_range",
        "organizations",
        "sla_target_default >= 50.00 AND sla_target_default <= 100.00",
    )


def downgrade() -> None:
    if _is_sqlite():
        return

    op.drop_constraint("chk_org_sla_target_range", "organizations", type_="check")
    op.drop_constraint("chk_incident_dates_coherent", "incidents", type_="check")
    op.drop_constraint("chk_maint_valid_window", "maintenance_windows", type_="check")
    op.drop_constraint("chk_device_interval_seconds", "devices", type_="check")
    op.drop_constraint("chk_metric_packet_loss", "metrics", type_="check")
