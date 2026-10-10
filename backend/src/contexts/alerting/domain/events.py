"""Eventos de domínio do contexto de Alerting.

Representam fatos consumados de mudanças de saúde de rede, disparos,
reconhecimentos e resoluções de incidentes gravados no Transactional Outbox
e publicados no Redis Streams e SSE para consumo assíncrono.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from src.core.domain.entity import generate_uuid7
from src.core.domain.events import DomainEvent


@dataclass(frozen=True)
class IncidentTriggeredEvent(DomainEvent):
    """Evento disparado quando uma anomalia severa ou queda (DOWN) é detectada."""

    device_id: UUID = field(default_factory=generate_uuid7)
    incident_id: UUID | None = None
    organization_id: UUID | None = None
    device_name: str = ""
    device_ip: str = ""
    severity: str = "CRITICAL"
    reason: str = ""
    latency_ms: float = 0.0
    packet_loss_pct: float = 0.0
    previous_status: str = ""
    new_status: str = ""
    consecutive_failures: int = 0
    last_probe_details: dict[str, Any] | None = None
    protocol: str = ""
    extra_data: dict[str, Any] | None = None


@dataclass(frozen=True)
class IncidentAcknowledgedEvent(DomainEvent):
    """Evento emitido quando um operador NOC assume formalmente o incidente."""

    incident_id: UUID = field(default_factory=generate_uuid7)
    device_id: UUID = field(default_factory=generate_uuid7)
    operator_id: UUID = field(default_factory=generate_uuid7)
    organization_id: UUID | None = None
    glpi_ticket_id: int | None = None
    acknowledged_at: datetime | None = None
    extra_data: dict[str, Any] | None = None


@dataclass(frozen=True)
class IncidentResolvedEvent(DomainEvent):
    """Evento emitido quando um incidente é resolvido e o ativo restabelece sua integridade."""

    device_id: UUID = field(default_factory=generate_uuid7)
    incident_id: UUID | None = None
    organization_id: UUID | None = None
    operator_id: UUID | None = None
    glpi_ticket_id: int | None = None
    device_name: str = ""
    device_ip: str = ""
    severity: str = "RESOLVED"
    reason: str = ""
    root_cause: str = ""
    downtime_minutes: int | None = None
    started_at: datetime | None = None
    resolved_at: datetime | None = None
    latency_ms: float = 0.0
    packet_loss_pct: float = 0.0
    previous_status: str = ""
    new_status: str = "UP"
    consecutive_successes: int = 0
    last_probe_details: dict[str, Any] | None = None
    protocol: str = ""
    extra_data: dict[str, Any] | None = None


@dataclass(frozen=True)
class DeviceDegradedEvent(DomainEvent):
    """Evento emitido quando há degradação dinâmica no enlace (alerta preventivo NOC)."""

    device_id: UUID = field(default_factory=generate_uuid7)
    organization_id: UUID | None = None
    device_name: str = ""
    device_ip: str = ""
    severity: str = "WARNING"
    reason: str = ""
    latency_ms: float = 0.0
    packet_loss_pct: float = 0.0
    previous_status: str = ""
    new_status: str = "DEGRADED"
    extra_data: dict[str, Any] | None = None
