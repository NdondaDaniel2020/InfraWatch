"""Subdomínio de cálculo e gestão analítica de SLA."""

from src.contexts.sla.domain.calculator import calculate_sla
from src.contexts.sla.domain.models import (
    DowntimePeriod,
    MaintenanceWindow,
    SlaCalculationResult,
)

__all__ = [
    "DowntimePeriod",
    "MaintenanceWindow",
    "SlaCalculationResult",
    "calculate_sla",
]
