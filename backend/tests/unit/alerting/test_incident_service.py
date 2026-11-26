"""Testes unitários para o IncidentService (Alerting)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.contexts.alerting.domain.exceptions import IncidentNotFoundError
from src.contexts.alerting.domain.incident import Incident, IncidentSeverity, IncidentStatus
from src.contexts.alerting.schemas.requests import CreateIncidentRequest
from src.contexts.alerting.services.incident_service import IncidentService
from src.core.database.unit_of_work import AbstractUnitOfWork


@pytest.fixture
def mock_uow_and_session():
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock()

    mock_uow = MagicMock(spec=AbstractUnitOfWork)
    mock_uow.session = mock_session
    mock_uow.commit = AsyncMock()
    return mock_uow, mock_session


@pytest.mark.asyncio
async def test_create_incident_success(mock_uow_and_session) -> None:
    """Valida criação de incidente, gravação no outbox e broadcast SSE."""
    mock_uow, _ = mock_uow_and_session
    mock_broadcaster = AsyncMock()

    service = IncidentService(uow_or_session=mock_uow, broadcaster=mock_broadcaster)
    service._repo = AsyncMock()

    device_id = uuid4()
    org_id = uuid4()
    created_incident = Incident(
        id=uuid4(),
        device_id=device_id,
        organization_id=org_id,
        title="Link Down",
        severity=IncidentSeverity.CRITICAL,
    )
    service._repo.save.return_value = created_incident

    with patch(
        "src.contexts.alerting.services.incident_service.OutboxRepository.add_event"
    ) as mock_outbox:
        req = CreateIncidentRequest(
            device_id=device_id,
            organization_id=org_id,
            title="Link Down",
            severity="CRITICAL",
        )
        saved = await service.create_incident(req)

        assert saved.title == "Link Down"
        service._repo.save.assert_called_once()
        mock_uow.commit.assert_called_once()
        mock_outbox.assert_called_once()
        mock_broadcaster.broadcast.assert_called_once()


@pytest.mark.asyncio
async def test_acknowledge_and_resolve_incident(mock_uow_and_session) -> None:
    """Valida fluxo de acknowledge e resolução de incidente com cálculo de downtime."""
    mock_uow, _ = mock_uow_and_session
    mock_broadcaster = AsyncMock()

    service = IncidentService(uow_or_session=mock_uow, broadcaster=mock_broadcaster)
    service._repo = AsyncMock()

    incident_id = uuid4()
    operator_id = uuid4()
    incident = Incident(
        id=incident_id,
        device_id=uuid4(),
        organization_id=uuid4(),
        title="Alta Latência",
        severity=IncidentSeverity.DEGRADED,
    )
    service._repo.get_by_id.return_value = incident
    service._repo.save.return_value = incident

    # 1. Acknowledge
    with patch("src.contexts.alerting.services.incident_service.OutboxRepository.add_event"):
        acked = await service.acknowledge_incident(incident_id, operator_id)
        assert acked.status == IncidentStatus.ACKNOWLEDGED
        assert acked.operator_id == operator_id
        assert acked.acknowledged_at is not None

    # 2. Resolve
    with patch("src.contexts.alerting.services.incident_service.OutboxRepository.add_event"):
        resolved = await service.resolve_incident(
            incident_id, root_cause="Cabo de fibra rompido reparado", operator_id=operator_id
        )
        assert resolved.status == IncidentStatus.RESOLVED
        assert resolved.root_cause == "Cabo de fibra rompido reparado"
        assert resolved.resolved_at is not None


@pytest.mark.asyncio
async def test_incident_not_found_handling(mock_uow_and_session) -> None:
    """Valida erro IncidentNotFoundError ao buscar id inexistente."""
    mock_uow, _ = mock_uow_and_session
    service = IncidentService(uow_or_session=mock_uow)
    service._repo = AsyncMock()
    service._repo.get_by_id.return_value = None

    non_existent = uuid4()
    with pytest.raises(IncidentNotFoundError):
        await service.get_incident(non_existent)

    with pytest.raises(IncidentNotFoundError):
        await service.acknowledge_incident(non_existent, uuid4())

    with pytest.raises(IncidentNotFoundError):
        await service.resolve_incident(non_existent, "Causa")


@pytest.mark.asyncio
async def test_create_glpi_ticket_flow(mock_uow_and_session) -> None:
    """Valida abertura manual de ticket GLPI para incidente."""
    mock_uow, _ = mock_uow_and_session
    mock_broadcaster = AsyncMock()

    mock_glpi = AsyncMock()
    mock_glpi.__aenter__.return_value = mock_glpi
    mock_glpi.open_ticket.return_value = 9999

    service = IncidentService(
        uow_or_session=mock_uow,
        broadcaster=mock_broadcaster,
        glpi_client=mock_glpi,
    )
    service._repo = AsyncMock()

    incident_id = uuid4()
    incident = Incident(
        id=incident_id,
        device_id=uuid4(),
        organization_id=uuid4(),
        title="Queda de BGP",
        severity=IncidentSeverity.CRITICAL,
    )
    service._repo.get_by_id.return_value = incident
    service._repo.save.return_value = incident

    # 1. Sucesso
    updated = await service.create_glpi_ticket(incident_id, operator_id=uuid4())
    assert updated.glpi_ticket_id == 9999
    mock_glpi.open_ticket.assert_called_once()
    mock_broadcaster.broadcast.assert_called_once()

    # 2. Chamado já existente -> erro
    with pytest.raises(ValueError, match="já possui chamado GLPI associado"):
        await service.create_glpi_ticket(incident_id, operator_id=uuid4())
