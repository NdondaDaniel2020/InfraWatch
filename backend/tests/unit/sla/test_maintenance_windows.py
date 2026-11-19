"""Testes unitários para KPIs e detalhamento de Janelas de Manutenção Programada."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.sla.domain.models import MaintenanceWindow
from src.contexts.sla.services.sla_service import SlaService


@pytest.mark.asyncio
async def test_get_maintenance_kpi_summary_calcula_kpis_corretamente():
    session = AsyncMock()
    service = SlaService(session)

    # Mock execute para contadores de ativas, agendadas e horas isentas
    res_active = MagicMock()
    res_active.scalar_one.return_value = 2

    res_scheduled = MagicMock()
    res_scheduled.scalar_one.return_value = 3

    now = datetime.now(UTC)
    mock_window = MagicMock()
    mock_window.id = uuid4()
    mock_window.start_time = now + timedelta(hours=1)
    mock_window.end_time = now + timedelta(hours=3)
    mock_window.is_approved = True

    res_exempted = MagicMock()
    res_exempted.scalars.return_value.all.return_value = [mock_window]

    session.execute.side_effect = [res_active, res_scheduled, res_exempted]

    kpis = await service.get_maintenance_kpi_summary()

    assert kpis.active_now_count == 2
    assert kpis.scheduled_count == 3
    assert kpis.exempted_hours_month == 2.0
    assert kpis.contractual_limit_hours == 8.0
    assert kpis.activeNowCount == 2
    assert kpis.scheduledCount == 3
    assert kpis.exemptedHoursMonth == 2.0


@pytest.mark.asyncio
async def test_list_maintenance_windows_with_details_enriquece_nomes():
    session = AsyncMock()
    service = SlaService(session)

    window_id = uuid4()
    dev_id = uuid4()
    org_id = uuid4()
    now = datetime.now(UTC)

    mock_window = MaintenanceWindow(
        id=window_id,
        device_id=dev_id,
        organization_id=org_id,
        start_time=now,
        end_time=now + timedelta(hours=2),
        is_approved=True,
        description="Atualização de Switch Core",
        created_at=now,
    )

    service._repo.list_windows = AsyncMock(return_value=([mock_window], 1))

    # Mock retorno da busca de devices e organizations
    res_dev = MagicMock()
    res_dev.all.return_value = [(dev_id, "SW-CORE-LUANDA-01")]

    res_org = MagicMock()
    res_org.all.return_value = [(org_id, "Banco Sol S.A.")]

    session.execute.side_effect = [res_dev, res_org]

    items, total = await service.list_maintenance_windows_with_details()

    assert total == 1
    assert len(items) == 1
    assert items[0].id == window_id
    assert items[0].device_name == "SW-CORE-LUANDA-01"
    assert items[0].client_name == "Banco Sol S.A."
    assert items[0].rfc_number == f"RFC-{str(window_id)[:8].upper()}"
