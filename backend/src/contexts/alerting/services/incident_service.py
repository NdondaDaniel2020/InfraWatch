"""Serviço de aplicação para gestão do ciclo de vida de incidentes.

Orquestra casos de uso de atendimento (Acknowledge e Resolve),
persiste alterações transacionais com Outbox e dispara eventos em tempo real via SSE.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.alerting.database.repository import IncidentRepository
from src.contexts.alerting.domain.exceptions import IncidentNotFoundError
from src.contexts.alerting.domain.incident import Incident, IncidentSeverity
from src.contexts.alerting.schemas.requests import CreateIncidentRequest
from src.core.database.outbox_repository import OutboxRepository
from src.core.database.unit_of_work import AbstractUnitOfWork
from src.core.messaging.sse_broadcaster import SSEBroadcaster, get_sse_broadcaster

logger = logging.getLogger("infrawatch.alerting.incident_service")


class IncidentService:
    """Serviço de aplicação para comandos e consultas de incidentes."""

    def __init__(
        self,
        uow_or_session: AbstractUnitOfWork | AsyncSession,
        broadcaster: SSEBroadcaster | None = None,
    ) -> None:
        if isinstance(uow_or_session, AbstractUnitOfWork):
            self._uow: AbstractUnitOfWork | None = uow_or_session
            self._session: AsyncSession = uow_or_session.session
        else:
            self._uow = None
            self._session = uow_or_session

        self._repo = IncidentRepository(self._session)
        self._broadcaster = broadcaster or get_sse_broadcaster()

    async def create_incident(self, req: CreateIncidentRequest) -> Incident:
        """Cria e persiste um novo incidente disparando eventos associados."""
        incident = Incident(
            device_id=req.device_id,
            organization_id=req.organization_id,
            title=req.title,
            severity=IncidentSeverity(req.severity)
            if req.severity in IncidentSeverity._value2member_map_
            else IncidentSeverity.CRITICAL,
        )
        saved = await self._repo.save(incident)

        # Registra eventos no Outbox
        for event in incident.pull_domain_events():
            OutboxRepository.add_event(self._session, event, aggregate_type="Incident")
            try:
                target_org = str(incident.organization_id) if incident.organization_id else None
                await self._broadcaster.broadcast(event, organization_id=target_org)
            except Exception:  # noqa: BLE001 - Falha de entrega SSE não deve abortar transação de persistência
                logger.warning("Falha ao emitir SSE para criação do incidente %s", incident.id)

        return saved

    async def acknowledge_incident(
        self,
        incident_id: UUID,
        operator_id: UUID,
        acknowledged_at: datetime | None = None,
    ) -> Incident:
        """Registra o operador logado que assumiu o atendimento e emite broadcast via SSE."""
        incident = await self._repo.get_by_id(incident_id)
        if incident is None:
            raise IncidentNotFoundError(incident_id)

        incident.acknowledge(operator_id=operator_id, acknowledged_at=acknowledged_at)
        saved = await self._repo.save(incident)

        # Grava eventos de domínio no Transactional Outbox e publica via SSE
        for event in incident.pull_domain_events():
            OutboxRepository.add_event(self._session, event, aggregate_type="Incident")
            try:
                target_org = str(incident.organization_id) if incident.organization_id else None
                await self._broadcaster.broadcast(event, organization_id=target_org)
            except Exception:  # noqa: BLE001 - Falha de entrega SSE não deve abortar transação de persistência
                logger.warning("Falha ao emitir SSE para acknowledge do incidente %s", incident_id)

        return saved

    async def resolve_incident(
        self,
        incident_id: UUID,
        root_cause: str,
        operator_id: UUID | None = None,
        resolved_at: datetime | None = None,
    ) -> Incident:
        """Encerra o incidente com justificativa técnica, calcula o downtime e emite broadcast SSE."""
        incident = await self._repo.get_by_id(incident_id)
        if incident is None:
            raise IncidentNotFoundError(incident_id)

        incident.resolve(
            root_cause=root_cause,
            resolved_at=resolved_at,
            operator_id=operator_id,
        )
        saved = await self._repo.save(incident)

        # Grava eventos de domínio no Transactional Outbox e publica via SSE
        for event in incident.pull_domain_events():
            OutboxRepository.add_event(self._session, event, aggregate_type="Incident")
            try:
                target_org = str(incident.organization_id) if incident.organization_id else None
                await self._broadcaster.broadcast(event, organization_id=target_org)
            except Exception:  # noqa: BLE001 - Falha de entrega SSE não deve abortar transação de persistência
                logger.warning("Falha ao emitir SSE para resolve do incidente %s", incident_id)

        return saved

    async def get_incident(self, incident_id: UUID) -> Incident:
        """Recupera um incidente por seu identificador único."""
        incident = await self._repo.get_by_id(incident_id)
        if incident is None:
            raise IncidentNotFoundError(incident_id)
        return incident

    async def list_incidents(
        self,
        organization_id: UUID | None = None,
        status: str | None = None,
        device_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Incident], int]:
        """Consulta incidentes cadastrados com filtros."""
        return await self._repo.list_incidents(
            organization_id=organization_id,
            status=status,
            device_id=device_id,
            limit=limit,
            offset=offset,
        )
