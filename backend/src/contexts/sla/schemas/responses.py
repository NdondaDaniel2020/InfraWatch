"""Schemas Pydantic de saída para o contexto de SLA e Janelas de Manutenção."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.contexts.sla.domain.models import MaintenanceWindow, SlaCalculationResult


class MaintenanceWindowResponse(BaseModel):
    """Representação serializada de uma Janela de Manutenção Programada."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_id: UUID | None
    organization_id: UUID | None
    start_time: datetime
    end_time: datetime
    is_approved: bool
    description: str
    created_at: datetime

    @classmethod
    def from_domain(cls, window: MaintenanceWindow) -> MaintenanceWindowResponse:
        return cls(
            id=window.id,
            device_id=window.device_id,
            organization_id=window.organization_id,
            start_time=window.start_time,
            end_time=window.end_time,
            is_approved=window.is_approved,
            description=window.description,
            created_at=window.created_at,
        )


class MaintenanceWindowListResponse(BaseModel):
    """Resposta paginada da listagem de janelas de manutenção."""

    items: list[MaintenanceWindowResponse]
    total: int
    page: int
    page_size: int


class SlaReportResponse(BaseModel):
    """Relatório analítico e contratual de disponibilidade (SLA)."""

    device_id: UUID | None
    start_period: datetime
    end_period: datetime
    total_period_hours: float = Field(..., description="Duração total observada em horas")
    unplanned_downtime_minutes: float = Field(..., description="Downtime penalizado em minutos")
    exempted_downtime_minutes: float = Field(
        ..., description="Downtime isento em janelas aprovadas"
    )
    uptime_percentage: float = Field(..., description="Índice de disponibilidade alcançado (%)")
    sla_target: float = Field(..., description="Meta contratual de SLA (%)")
    sla_met: bool = Field(..., description="Indica se a meta contratual foi atendida")
    mttr_minutes: float = Field(..., description="Tempo médio de resolução em minutos")
    mtbf_hours: float = Field(..., description="Tempo médio entre falhas em horas")
    incidents_count: int = Field(..., description="Total de ocorrências registradas")
    exempted_incidents_count: int = Field(..., description="Ocorrências 100% isentas")

    @classmethod
    def from_calculation(
        cls, result: SlaCalculationResult, sla_target: float = 99.50
    ) -> SlaReportResponse:
        return cls(
            device_id=result.device_id,
            start_period=result.start_period,
            end_period=result.end_period,
            total_period_hours=result.total_period_hours,
            unplanned_downtime_minutes=result.unplanned_downtime_minutes,
            exempted_downtime_minutes=result.exempted_downtime_minutes,
            uptime_percentage=result.uptime_percentage,
            sla_target=sla_target,
            sla_met=result.uptime_percentage >= sla_target,
            mttr_minutes=result.mttr_minutes,
            mtbf_hours=result.mtbf_hours,
            incidents_count=result.incidents_count,
            exempted_incidents_count=result.exempted_incidents_count,
        )


class OrganizationSlaSummaryResponse(BaseModel):
    """Resumo executivo de SLA de uma organização para o portal do cliente."""

    tenant_id: str
    tenant_name: str
    uptime_current_month_pct: float
    sla_target_pct: float = 99.50
    downtime_balance_formatted: str
    mttr_minutes_avg: float
    next_maintenance_window: str | None = None
    cycle_month_label: str
    services_count: int


class OrganizationSlaHistoryItem(BaseModel):
    """Item mensal do histórico de SLA da organização."""

    cycle_label: str
    month: str
    uptime_pct: float
    target_pct: float = 99.50
    mttr_minutes: float
    incidents_count: int
    unplanned_downtime_minutes: float
    exempted_downtime_minutes: float
    status: str


class OrganizationSlaHistoryResponse(BaseModel):
    """Lista cronológica do histórico de SLA de uma organização."""

    tenant_id: str
    tenant_name: str
    items: list[OrganizationSlaHistoryItem]


class SlaDeviceReportItem(BaseModel):
    """Dados de SLA por dispositivo para o relatório oficial."""

    device_id: UUID
    device_name: str
    category: str
    uptime_gross_pct: float
    uptime_net_pct: float
    rfc_exempted_minutes: float
    sla_target_pct: float
    mttr_minutes: float
    status: str


class OrganizationSlaReportDetailsResponse(BaseModel):
    """Dados consolidados para o Relatório Oficial de SLA e exportação."""

    organization_id: str
    organization_name: str
    period_label: str
    start_period: datetime
    end_period: datetime
    uptime_net_pct: float
    uptime_gross_pct: float
    sla_target_pct: float
    sla_met: bool
    mttr_minutes: float
    mtbf_hours: float
    total_devices: int
    unplanned_downtime_minutes: float
    exempted_downtime_minutes: float
    devices: list[SlaDeviceReportItem]
    digital_signature: str


class SupportTicketResponse(BaseModel):
    """Confirmação de abertura de chamado de suporte pelo cliente."""

    ticket_id: str
    protocol: str
    title: str
    severity: str
    status: str
    created_at: datetime
    glpi_ticket_id: int | None = None
    message: str

