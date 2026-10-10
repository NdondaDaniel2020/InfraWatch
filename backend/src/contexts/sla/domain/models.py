"""Modelos e entidades de domínio do contexto de SLA."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from src.core.domain.entity import Entity, generate_uuid7


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


@dataclass(frozen=True)
class DowntimePeriod:
    """Representa um intervalo contínuo de indisponibilidade de um dispositivo."""

    start_time: datetime
    end_time: datetime
    incident_id: UUID | None = None

    def __post_init__(self) -> None:
        start_utc = _ensure_utc(self.start_time)
        end_utc = _ensure_utc(self.end_time)
        if start_utc and end_utc and end_utc < start_utc:
            raise ValueError("O horário final do downtime não pode ser anterior ao horário inicial.")
        object.__setattr__(self, "start_time", start_utc)
        object.__setattr__(self, "end_time", end_utc)

    @property
    def duration_seconds(self) -> float:
        """Duração total do período em segundos."""
        return max(0.0, (self.end_time - self.start_time).total_seconds())


class MaintenanceWindow(Entity):
    """Entidade que delimita uma Janela de Manutenção Programada.

    Períodos de indisponibilidade que coincidam com janelas aprovadas
    são isentos de penalidade no cálculo de disponibilidade contratual (ADR-011).
    """

    def __init__(
        self,
        start_time: datetime,
        end_time: datetime,
        description: str,
        device_id: UUID | None = None,
        organization_id: UUID | None = None,
        is_approved: bool = False,
        id: UUID | None = None,
        created_at: datetime | None = None,
    ) -> None:
        super().__init__(id=id or generate_uuid7(), created_at=created_at)
        start_utc = _ensure_utc(start_time)
        end_utc = _ensure_utc(end_time)
        if start_utc is None or end_utc is None:
            raise ValueError("start_time e end_time são obrigatórios.")
        if end_utc <= start_utc:
            raise ValueError("O horário de término da manutenção deve ser posterior ao início.")

        self.start_time = start_utc
        self.end_time = end_utc
        self.description = description.strip()
        self.device_id = device_id
        self.organization_id = organization_id
        self.is_approved = is_approved

    def approve(self) -> None:
        """Aprova formalmente a janela de manutenção programada."""
        self.is_approved = True

    def revoke_approval(self) -> None:
        """Revoga a aprovação da janela."""
        self.is_approved = False

    def overlaps(self, start: datetime, end: datetime) -> bool:
        """Verifica se há sobreposição temporal entre a janela e outro intervalo."""
        s = _ensure_utc(start)
        e = _ensure_utc(end)
        if s is None or e is None or e <= s:
            return False
        return max(self.start_time, s) < min(self.end_time, e)

    def calculate_overlap_seconds(self, start: datetime, end: datetime) -> float:
        """Calcula os segundos exatos de interseção entre a janela e o intervalo informado."""
        s = _ensure_utc(start)
        e = _ensure_utc(end)
        if s is None or e is None or e <= s:
            return 0.0
        overlap_start = max(self.start_time, s)
        overlap_end = min(self.end_time, e)
        if overlap_end > overlap_start:
            return (overlap_end - overlap_start).total_seconds()
        return 0.0


@dataclass(frozen=True)
class SlaCalculationResult:
    """Resultado analítico detalhado do cálculo de SLA para um período avaliado."""

    device_id: UUID | None
    start_period: datetime
    end_period: datetime
    total_period_seconds: float
    total_period_hours: float
    unplanned_downtime_seconds: float
    unplanned_downtime_minutes: float
    exempted_downtime_seconds: float
    exempted_downtime_minutes: float
    uptime_percentage: float
    mttr_minutes: float
    mtbf_hours: float
    incidents_count: int
    exempted_incidents_count: int
    raw_downtime_seconds: float = field(default=0.0)
