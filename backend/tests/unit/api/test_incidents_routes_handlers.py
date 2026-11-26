"""Testes unitários para route handlers de Incidentes e Tickets GLPI."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from src.contexts.alerting.api.routes.incidents import (
    acknowledge_incident,
    create_glpi_ticket_for_incident,
    create_incident,
    get_incident,
    list_incidents,
    resolve_incident,
)
from src.contexts.alerting.domain.exceptions import IncidentAlreadyResolvedError
from src.contexts.alerting.domain.incident import Incident, IncidentSeverity, IncidentStatus
from src.contexts.alerting.schemas.requests import (
    AcknowledgeIncidentRequest,
    CreateIncidentRequest,
    ResolveIncidentRequest,
)
from src.contexts.alerting.schemas.responses import (
    IncidentListResponse,
    IncidentResponse,
)
from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.core.web.pagination import PaginationParams


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id=str(uuid4()),
        email="operator@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=str(uuid4()),
    )


@pytest.fixture
def tenant_operator_user():
    org_id = str(uuid4())
    return AuthenticatedUser(
        id=str(uuid4()),
        email="viewer@tenant.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=org_id,
    )


@pytest.fixture
def domain_incident():
    now = datetime.now(UTC)
    return Incident(
        id=uuid4(),
        organization_id=uuid4(),
        device_id=uuid4(),
        title="Ativo Inacessível",
        severity=IncidentSeverity.CRITICAL,
        status=IncidentStatus.TRIGGERED,
        started_at=now,
    )


@pytest.mark.asyncio
async def test_list_incidents_handler_global_operator(current_user, domain_incident) -> None:
    mock_service = AsyncMock()
    mock_service.list_incidents.return_value = ([domain_incident], 1)
    pagination = PaginationParams(page=1, page_size=20)

    res = await list_incidents(
        user=current_user,
        service=mock_service,
        pagination=pagination,
        organization_id=domain_incident.organization_id,
        status_filter="OPEN",
        device_id=domain_incident.device_id,
    )

    assert isinstance(res, IncidentListResponse)
    assert res.total == 1
    assert len(res.items) == 1
    mock_service.list_incidents.assert_awaited_once_with(
        organization_id=domain_incident.organization_id,
        status="OPEN",
        device_id=domain_incident.device_id,
        limit=20,
        offset=0,
    )


@pytest.mark.asyncio
async def test_list_incidents_handler_tenant_scope_ok(
    tenant_operator_user, domain_incident
) -> None:
    mock_service = AsyncMock()
    mock_service.list_incidents.return_value = ([domain_incident], 1)
    pagination = PaginationParams(page=1, page_size=20)
    org_id = UUID(tenant_operator_user.organization_id)

    res = await list_incidents(
        user=tenant_operator_user,
        service=mock_service,
        pagination=pagination,
        organization_id=org_id,
    )

    assert isinstance(res, IncidentListResponse)
    mock_service.list_incidents.assert_awaited_once_with(
        organization_id=org_id,
        status=None,
        device_id=None,
        limit=20,
        offset=0,
    )


@pytest.mark.asyncio
async def test_list_incidents_handler_tenant_mismatch_raises_403(tenant_operator_user) -> None:
    mock_service = AsyncMock()
    pagination = PaginationParams(page=1, page_size=20)
    other_org_id = uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await list_incidents(
            user=tenant_operator_user,
            service=mock_service,
            pagination=pagination,
            organization_id=other_org_id,
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_create_incident_handler(current_user, domain_incident) -> None:
    mock_service = AsyncMock()
    mock_service.create_incident.return_value = domain_incident

    payload = CreateIncidentRequest(
        organization_id=domain_incident.organization_id,
        device_id=domain_incident.device_id,
        title="Dispositivo offline",
        severity=IncidentSeverity.CRITICAL,
    )

    res = await create_incident(
        payload=payload,
        user=current_user,
        service=mock_service,
    )

    assert isinstance(res, IncidentResponse)
    assert res.id == domain_incident.id
    mock_service.create_incident.assert_awaited_once_with(payload)


@pytest.mark.asyncio
async def test_incidents_lifecycle_handlers(current_user, domain_incident) -> None:
    """Valida consulta, reconhecimento, resolução e abertura de ticket GLPI."""
    mock_service = AsyncMock()
    mock_service.acknowledge_incident.return_value = domain_incident
    mock_service.resolve_incident.return_value = domain_incident
    mock_service.create_glpi_ticket.return_value = domain_incident

    # 1. get_incident sucesso
    inc = await get_incident(incident=domain_incident)
    assert inc.id == domain_incident.id

    # 2. acknowledge_incident
    ack = await acknowledge_incident(
        incident=domain_incident, user=current_user, service=mock_service
    )
    assert ack.id == domain_incident.id

    # 3. resolve_incident
    res_req = ResolveIncidentRequest(root_cause="Fibra rompida")
    res = await resolve_incident(
        incident=domain_incident, payload=res_req, user=current_user, service=mock_service
    )
    assert res.id == domain_incident.id

    # 4. create_glpi_ticket_for_incident
    domain_incident.glpi_ticket_id = 12345
    ticket_res = await create_glpi_ticket_for_incident(
        incident=domain_incident, user=current_user, service=mock_service
    )
    assert ticket_res.glpi_ticket_id == 12345


@pytest.mark.asyncio
async def test_acknowledge_incident_already_resolved(current_user, domain_incident) -> None:
    mock_service = AsyncMock()
    mock_service.acknowledge_incident.side_effect = IncidentAlreadyResolvedError("Já resolvido")

    with pytest.raises(HTTPException) as exc_info:
        await acknowledge_incident(
            incident=domain_incident,
            user=current_user,
            service=mock_service,
            payload=AcknowledgeIncidentRequest(),
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_resolve_incident_errors(current_user, domain_incident) -> None:
    mock_service = AsyncMock()
    mock_service.resolve_incident.side_effect = IncidentAlreadyResolvedError("Já resolvido")
    res_req = ResolveIncidentRequest(root_cause="Fibra")

    with pytest.raises(HTTPException) as exc_info:
        await resolve_incident(
            incident=domain_incident,
            payload=res_req,
            user=current_user,
            service=mock_service,
        )
    assert exc_info.value.status_code == 409

    mock_service.resolve_incident.side_effect = ValueError("Data inválida")
    with pytest.raises(HTTPException) as exc_info:
        await resolve_incident(
            incident=domain_incident,
            payload=res_req,
            user=current_user,
            service=mock_service,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_glpi_ticket_errors(current_user, domain_incident) -> None:
    mock_service = AsyncMock()
    mock_service.create_glpi_ticket.side_effect = ValueError("GLPI desabilitado")

    with pytest.raises(HTTPException) as exc_info:
        await create_glpi_ticket_for_incident(
            incident=domain_incident,
            user=current_user,
            service=mock_service,
        )
    assert exc_info.value.status_code == 409

    mock_service.create_glpi_ticket.side_effect = RuntimeError("GLPI indisponível")
    with pytest.raises(HTTPException) as exc_info:
        await create_glpi_ticket_for_incident(
            incident=domain_incident,
            user=current_user,
            service=mock_service,
        )
    assert exc_info.value.status_code == 503
