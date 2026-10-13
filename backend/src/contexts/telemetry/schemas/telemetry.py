"""Schemas Pydantic para dados de telemetria e ativos monitorados."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TelemetryMetricPoint(BaseModel):
    """Ponto individual de métrica coletada por uma sonda."""

    model_config = ConfigDict(from_attributes=True)

    metric_type: str = Field(..., description="Tipo da métrica (ex: latency_ms, packet_loss, jitter_ms)")
    value: float = Field(..., description="Valor numérico coletado")
    packet_loss: float = Field(default=0.0, description="Percentual de perda de pacotes")
    status: str = Field(..., description="Status de saúde da medição (UP, DEGRADED, DOWN, TIMEOUT)")
    timestamp: datetime = Field(..., description="Data e hora da coleta com fuso horário")


class MonitoredDeviceItem(BaseModel):
    """Resumo cadastral e último estado de telemetria de um dispositivo monitorado."""

    model_config = ConfigDict(from_attributes=True)

    device_id: UUID = Field(..., description="Identificador único do dispositivo")
    organization_id: UUID = Field(..., description="Identificador da organização proprietária")
    name: str = Field(..., description="Nome amigável do dispositivo")
    ip_address: str = Field(..., description="Endereço IP do alvo")
    protocol: str = Field(..., description="Protocolo principal de sondagem (ICMP, TCP, HTTP, etc.)")
    category: str = Field(..., description="Categoria do equipamento (ROUTER, SWITCH, SERVER, etc.)")
    status: str = Field(..., description="Status operacional consolidado (UP, DEGRADED, DOWN, PAUSED, MAINTENANCE)")
    is_paused: bool = Field(default=False, description="Indica se a sondagem está pausada")
    interval_seconds: int = Field(default=60, description="Intervalo entre coletas em segundos")
    last_latency_ms: float | None = Field(default=None, description="Última latência registrada em milissegundos")
    last_packet_loss: float | None = Field(default=None, description="Último percentual de perda de pacotes")
    last_monitored_at: datetime | None = Field(default=None, description="Timestamp da última telemetria registrada")


class MonitoredDevicesResponse(BaseModel):
    """Resposta consolidada da listagem de dispositivos monitorados."""

    total: int = Field(..., description="Total de dispositivos monitorados retornados")
    items: list[MonitoredDeviceItem] = Field(..., description="Lista de dispositivos com telemetria recente")


class MonitoredDeviceDetail(BaseModel):
    """Detalhes completos de um dispositivo monitorado e seu histórico recente de métricas."""

    model_config = ConfigDict(from_attributes=True)

    device_id: UUID = Field(..., description="Identificador único do dispositivo")
    organization_id: UUID = Field(..., description="Identificador da organização proprietária")
    name: str = Field(..., description="Nome amigável do dispositivo")
    hostname: str | None = Field(default=None, description="Hostname resolúvel do equipamento")
    ip_address: str = Field(..., description="Endereço IP do alvo")
    port: int = Field(default=0, description="Porta de serviço monitorada")
    protocol: str = Field(..., description="Protocolo de sondagem")
    category: str = Field(..., description="Categoria do equipamento")
    status: str = Field(..., description="Status operacional consolidado")
    is_paused: bool = Field(default=False, description="Indica se a sondagem está pausada")
    interval_seconds: int = Field(default=60, description="Intervalo entre coletas em segundos")
    last_latency_ms: float | None = Field(default=None, description="Última latência registrada")
    last_packet_loss: float | None = Field(default=None, description="Último percentual de perda de pacotes")
    last_monitored_at: datetime | None = Field(default=None, description="Timestamp da última coleta")
    recent_metrics: list[TelemetryMetricPoint] = Field(
        default_factory=list,
        description="Série temporal recente de pontos de métricas coletados",
    )
