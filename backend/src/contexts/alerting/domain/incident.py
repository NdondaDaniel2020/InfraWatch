"""Agregado Incident do contexto de Alerting.

Encapsula o ciclo de vida transacional de incidentes na plataforma:
TRIGGERED -> ACKNOWLEDGED -> RESOLVED.
Controla atribuição de operadores, integração bidirecional GLPI,
cálculo exato de tempo de indisponibilidade (downtime) e emissão de eventos.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from uuid import UUID

from src.contexts.alerting.domain.events import (
    IncidentAcknowledgedEvent,
    IncidentResolvedEvent,
)
from src.contexts.alerting.domain.exceptions import (
    IncidentAlreadyResolvedError,
)
from src.core.domain.aggregate import AggregateRoot
from src.core.domain.entity import generate_uuid7


class IncidentStatus(str, Enum):
    """Estados possíveis do ciclo de vida de um incidente."""

    TRIGGERED = "TRIGGERED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class IncidentSeverity(str, Enum):
    """Níveis de severidade operacional do incidente."""

    CRITICAL = "CRITICAL"
    DOWN = "DOWN"
    WARNING = "WARNING"
    DEGRADED = "DEGRADED"
    INFO = "INFO"


class Incident(AggregateRoot):
    """Raiz de Agregação de Incidente no InfraWatch.

    Invariantes de Domínio:
      1. Um incidente resolvido (RESOLVED) não pode ser reconhecido novamente.
      2. A resolução exige causa raiz técnica não-vazia.
      3. O cálculo de tempo de indisponibilidade (downtime_minutes) é computado
         com precisão em minutos a partir de `started_at` até `resolved_at`.
      4. Todo reconhecimento e resolução registra eventos de domínio para Outbox e SSE.
    """

    def __init__(
        self,
        device_id: UUID,
        organization_id: UUID | None = None,
        title: str = "",
        severity: str | IncidentSeverity = IncidentSeverity.CRITICAL,
        status: str | IncidentStatus = IncidentStatus.TRIGGERED,
        glpi_ticket_id: int | None = None,
        operator_id: UUID | None = None,
        root_cause: str | None = None,
        started_at: datetime | None = None,
        acknowledged_at: datetime | None = None,
        resolved_at: datetime | None = None,
        downtime_minutes: int | None = None,
        id: UUID | None = None,
        created_at: datetime | None = None,
    ) -> None:
        super().__init__(id=id or generate_uuid7(), created_at=created_at)
        self.device_id = device_id
        self.organization_id = organization_id
        self.title = title
        self.severity = (
            severity.value if isinstance(severity, IncidentSeverity) else str(severity)
        )
        self.status = (
            status if isinstance(status, IncidentStatus) else IncidentStatus(str(status))
        )
        self.glpi_ticket_id = glpi_ticket_id
        self.operator_id = operator_id
        self.root_cause = root_cause
        self.started_at = started_at or datetime.now(UTC)
        self.acknowledged_at = acknowledged_at
        self.resolved_at = resolved_at
        self.downtime_minutes = downtime_minutes

    def acknowledge(
        self,
        operator_id: UUID,
        acknowledged_at: datetime | None = None,
    ) -> None:
        """Operador NOC assume formalmente o atendimento da ocorrência."""
        if self.status == IncidentStatus.RESOLVED:
            raise IncidentAlreadyResolvedError(
                "Não é possível reconhecer um incidente já resolvido."
            )

        ack_time = acknowledged_at or datetime.now(UTC)
        self.operator_id = operator_id
        self.acknowledged_at = ack_time
        self.status = IncidentStatus.ACKNOWLEDGED

        self.add_domain_event(
            IncidentAcknowledgedEvent(
                incident_id=self.id,
                device_id=self.device_id,
                operator_id=operator_id,
                organization_id=self.organization_id,
                glpi_ticket_id=self.glpi_ticket_id,
                acknowledged_at=ack_time,
            )
        )

    def resolve(
        self,
        root_cause: str,
        resolved_at: datetime | None = None,
        operator_id: UUID | None = None,
    ) -> int:
        """Encerra o incidente registrando a justificativa técnica e o downtime."""
        clean_cause = root_cause.strip() if root_cause else ""
        if not clean_cause:
            raise ValueError("A causa raiz é obrigatória para a resolução do incidente.")

        if self.status == IncidentStatus.RESOLVED:
            raise IncidentAlreadyResolvedError(
                "O incidente já se encontra resolvido."
            )

        res_time = resolved_at or datetime.now(UTC)
        self.resolved_at = res_time
        self.root_cause = clean_cause
        if operator_id and not self.operator_id:
            self.operator_id = operator_id

        # Cálculo exato do tempo de indisponibilidade em minutos
        total_seconds = max(0.0, (self.resolved_at - self.started_at).total_seconds())
        self.downtime_minutes = int(total_seconds // 60)
        self.status = IncidentStatus.RESOLVED

        self.add_domain_event(
            IncidentResolvedEvent(
                incident_id=self.id,
                device_id=self.device_id,
                organization_id=self.organization_id,
                operator_id=self.operator_id,
                glpi_ticket_id=self.glpi_ticket_id,
                root_cause=clean_cause,
                downtime_minutes=self.downtime_minutes,
                started_at=self.started_at,
                resolved_at=self.resolved_at,
                reason=f"Incidente resolvido com {self.downtime_minutes} min de downtime: {clean_cause}",
            )
        )

        return self.downtime_minutes

    def set_glpi_ticket_id(self, ticket_id: int) -> None:
        """Vincula o ticket criado no GLPI ao incidente."""
        self.glpi_ticket_id = ticket_id
