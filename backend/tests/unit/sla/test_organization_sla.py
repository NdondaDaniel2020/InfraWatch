"""Testes unitários para o resumo, histórico e chamados de SLA da organização."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.sla.schemas.requests import CreateSupportTicketRequest
from src.contexts.sla.schemas.responses import SlaReportResponse
from src.contexts.sla.services.sla_service import SlaService


@pytest.mark.asyncio
async def test_get_organization_sla_summary_retorna_resumo_calculado():
    session = AsyncMock()
    org_id = uuid4()

    # Mock organização
    mock_org = MagicMock()
    mock_org.id = org_id
    mock_org.name = "Banco Sol S.A."

    org_res = MagicMock()
    org_res.scalar_one_or_none.return_value = mock_org
    session.execute.return_value = org_res

    service = SlaService(session)

    # Mock do cálculo dos relatórios
    mock_dev = MagicMock()
    mock_dev.id = uuid4()
    mock_dev.name = "Router-Core"

    now = datetime.now(UTC)
    mock_rep = SlaReportResponse(
        device_id=mock_dev.id,
        start_period=now,
        end_period=now,
        total_period_hours=720.0,
        unplanned_downtime_minutes=10.0,
        exempted_downtime_minutes=120.0,
        uptime_percentage=99.98,
        sla_target=99.50,
        sla_met=True,
        mttr_minutes=5.0,
        mtbf_hours=400.0,
        incidents_count=1,
        exempted_incidents_count=1,
    )
    service.get_organization_sla_reports = AsyncMock(return_value=[(mock_dev, mock_rep)])
    service._repo.list_windows = AsyncMock(return_value=([], 0))

    summary = await service.get_organization_sla_summary(org_id)

    assert summary.tenant_id == str(org_id)
    assert summary.tenant_name == "Banco Sol S.A."
    assert summary.uptime_current_month_pct == 99.98
    assert summary.sla_target_pct == 99.50
    assert summary.services_count == 1
    assert "2h 00m isentos" in summary.downtime_balance_formatted


@pytest.mark.asyncio
async def test_get_organization_sla_history_gera_itens_mensais():
    session = AsyncMock()
    org_id = uuid4()

    mock_org = MagicMock()
    mock_org.name = "Unitel Angola"
    org_res = MagicMock()
    org_res.scalar_one_or_none.return_value = mock_org
    session.execute.return_value = org_res

    service = SlaService(session)
    service.get_organization_sla_reports = AsyncMock(return_value=[])

    history = await service.get_organization_sla_history(org_id, months_count=3)

    assert history.tenant_id == str(org_id)
    assert len(history.items) == 3
    for item in history.items:
        assert item.target_pct == 99.50
        assert item.status in {"CONFORME", "VIOLADO"}


@pytest.mark.asyncio
async def test_create_support_ticket_retorna_protocolo_formal():
    session = AsyncMock()
    org_id = uuid4()

    service = SlaService(session)
    payload = CreateSupportTicketRequest(
        title="Instabilidade no canal Internet Banking",
        description="Identificada lentidão nos retornos das requisições HTTPS para clientes móveis.",
        severity="HIGH",
    )

    ticket = await service.create_support_ticket(
        organization_id=org_id,
        payload=payload,
        user_email="gestor.ti@bancosol.ao",
    )

    assert ticket.protocol.startswith("INFRA-")
    assert ticket.title == payload.title
    assert ticket.severity == "HIGH"
    assert ticket.status == "OPEN"
