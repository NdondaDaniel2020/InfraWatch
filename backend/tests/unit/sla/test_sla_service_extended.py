"""Testes unitários estendidos para o SlaService (SLA / Maintenance Windows)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.alerting.domain.incident import Incident, IncidentSeverity
from src.contexts.sla.domain.models import MaintenanceWindow
from src.contexts.sla.schemas.requests import (
    CreateMaintenanceWindowRequest,
    CreateSupportTicketRequest,
    UpdateMaintenanceWindowRequest,
)
from src.contexts.sla.services.sla_service import SlaService, _ensure_utc
from src.core.database.unit_of_work import AbstractUnitOfWork


def test_ensure_utc() -> None:
    """Valida helper _ensure_utc."""
    assert _ensure_utc(None) is None
    dt = datetime(2026, 5, 1, 10, 0, 0)  # noqa: DTZ001
    assert _ensure_utc(dt).tzinfo == UTC


@pytest.fixture
def mock_uow_and_session():
    mock_session = AsyncMock()
    mock_uow = MagicMock(spec=AbstractUnitOfWork)
    mock_uow.session = mock_session
    mock_uow.commit = AsyncMock()
    return mock_uow, mock_session


@pytest.mark.asyncio
async def test_calculate_device_sla(mock_uow_and_session) -> None:
    """Valida cálculo de disponibilidade SLA de dispositivo com incidentes e janela de manutenção."""
    mock_uow, _ = mock_uow_and_session
    service = SlaService(uow_or_session=mock_uow)
    service._incident_repo = AsyncMock()
    service._repo = AsyncMock()

    device_id = uuid4()
    now = datetime.now(UTC)
    start_period = now - timedelta(days=7)
    end_period = now

    # Simular incidente de 1 hora
    inc = Incident(
        id=uuid4(),
        device_id=device_id,
        title="Falha de Switch",
        severity=IncidentSeverity.CRITICAL,
    )
    inc.started_at = start_period + timedelta(days=1)
    inc.resolved_at = inc.started_at + timedelta(hours=1)
    service._incident_repo.list_for_sla.return_value = [inc]

    # Simular janela aprovada de 30 minutos que sobrepõe
    mw = MaintenanceWindow(
        id=uuid4(),
        start_time=inc.started_at,
        end_time=inc.started_at + timedelta(minutes=30),
        description="Troca de GBIC",
        device_id=device_id,
        is_approved=True,
    )
    service._repo.find_overlapping.return_value = [mw]

    report = await service.calculate_device_sla(
        device_id=device_id,
        start_period=start_period,
        end_period=end_period,
        sla_target=99.5,
    )

    assert report.device_id == device_id
    assert report.uptime_percentage > 99.0
    assert report.incidents_count == 1


@pytest.mark.asyncio
async def test_calculate_device_sla_invalid_dates(mock_uow_and_session) -> None:
    """Garante erro de validação quando end <= start."""
    mock_uow, _ = mock_uow_and_session
    service = SlaService(uow_or_session=mock_uow)

    now = datetime.now(UTC)
    with pytest.raises(ValueError, match="posterior ao horário inicial"):
        await service.calculate_device_sla(
            device_id=uuid4(),
            start_period=now,
            end_period=now - timedelta(days=1),
        )


@pytest.mark.asyncio
async def test_maintenance_window_crud_and_approval(mock_uow_and_session) -> None:
    """Valida criação, atualização, aprovação e exclusão de janela de manutenção."""
    mock_uow, _ = mock_uow_and_session
    service = SlaService(uow_or_session=mock_uow)
    service._repo = AsyncMock()
    service._device_repo = AsyncMock()

    dev_id = uuid4()
    org_id = uuid4()

    window_id = uuid4()
    mw = MaintenanceWindow(
        id=window_id,
        start_time=datetime.now(UTC),
        end_time=datetime.now(UTC) + timedelta(hours=2),
        description="Upgrade Firmware",
        device_id=dev_id,
        organization_id=org_id,
        is_approved=False,
    )
    service._repo.save.return_value = mw
    service._repo.get_by_id.return_value = mw

    # 1. Create
    req = CreateMaintenanceWindowRequest(
        start_time=datetime.now(UTC),
        end_time=datetime.now(UTC) + timedelta(hours=2),
        description="Upgrade Firmware",
        device_id=dev_id,
        organization_id=org_id,
        is_approved=False,
    )
    created = await service.create_maintenance_window(req)
    assert created.description == "Upgrade Firmware"
    mock_uow.commit.assert_called()

    # 2. Update
    up_req = UpdateMaintenanceWindowRequest(description="Upgrade Firmware v2")
    updated = await service.update_maintenance_window(window_id, up_req)
    assert updated is not None
    assert updated.description == "Upgrade Firmware v2"

    # 3. Approve
    approved = await service.approve_maintenance_window(window_id)
    assert approved is not None
    assert approved.is_approved is True

    # 4. Delete
    service._repo.delete.return_value = True
    deleted = await service.delete_maintenance_window(window_id)
    assert deleted is True


@pytest.mark.asyncio
async def test_create_support_ticket_glpi(mock_uow_and_session) -> None:
    """Valida abertura de chamado de suporte no GLPI pelo SlaService."""
    mock_uow, _ = mock_uow_and_session

    mock_glpi = AsyncMock()
    mock_glpi.__aenter__.return_value = mock_glpi
    mock_glpi.open_ticket.return_value = 5544

    service = SlaService(uow_or_session=mock_uow, glpi_client=mock_glpi)
    service._org_repo = AsyncMock()
    service._device_repo = AsyncMock()

    org_id = uuid4()
    mock_org = MagicMock()
    mock_org.name = "Cliente Alfa"
    service._org_repo.get_by_id.return_value = mock_org

    req = CreateSupportTicketRequest(
        title="Problema de Roteamento",
        description="Instabilidade no link MPLS",
        organization_id=org_id,
        urgency=3,
        impact=3,
    )

    ticket = await service.create_support_ticket(
        organization_id=org_id,
        payload=req,
        user_email="user@cliente.ao",
    )
    assert ticket.glpi_ticket_id == 5544
    assert ticket.title == "Problema de Roteamento"
    assert "5544" in ticket.message
