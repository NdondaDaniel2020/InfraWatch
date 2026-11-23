"""Testes unitários para o cálculo de disponibilidade diária de SLA (Histograma de 31 dias)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.alerting.database.models import IncidentModel
from src.contexts.iam.database.models import OrganizationModel
from src.contexts.inventory.database.models import DeviceModel
from src.contexts.sla.database.models import MaintenanceWindowModel
from src.contexts.sla.services.sla_service import SlaService


@pytest.mark.asyncio
async def test_get_organization_daily_sla_retorna_todos_os_dias_do_mes():
    session = AsyncMock()
    service = SlaService(session)

    org_id = uuid4()
    mock_org = MagicMock(spec=OrganizationModel)
    mock_org.id = org_id
    mock_org.name = "Banco Nacional de Angola"

    mock_dev = MagicMock(spec=DeviceModel)
    mock_dev.id = uuid4()
    mock_dev.name = "SW-CORE-01"
    mock_dev.organization_id = org_id

    # Configuração dos retornos das queries executadas na ordem:
    # 1. select OrganizationModel
    # 2. select DeviceModel
    # 3. select IncidentModel
    # 4. select MaintenanceWindowModel
    res_org = MagicMock()
    res_org.scalar_one_or_none.return_value = mock_org

    res_dev = MagicMock()
    res_dev.scalars.return_value.all.return_value = [mock_dev]

    res_inc = MagicMock()
    res_inc.scalars.return_value.all.return_value = []

    res_mw = MagicMock()
    res_mw.scalars.return_value.all.return_value = []

    session.execute.side_effect = [res_org, res_dev, res_inc, res_mw]

    # Teste para Outubro 2026 (31 dias)
    result = await service.get_organization_daily_sla(
        organization_id=org_id,
        year=2026,
        month=10,
        target_pct=99.50,
    )

    assert result.tenant_id == str(org_id)
    assert result.tenant_name == "Banco Nacional de Angola"
    assert result.year == 2026
    assert result.month == 10
    assert result.period_label == "Outubro 2026"
    assert result.total_days == 31
    assert len(result.days) == 31
    assert result.days[0].day == "01"
    assert result.days[30].day == "31"
    # Como outubro de 2026 é no passado ou avaliado completamente, todos sem incidentes são nominais
    assert result.days[0].type in {"nominal", "today", "future"}
    assert result.days[0].uptime_pct == 100.0


@pytest.mark.asyncio
async def test_get_organization_daily_sla_classifica_incidente_e_manutencao():
    session = AsyncMock()
    service = SlaService(session)

    org_id = uuid4()
    dev_id = uuid4()

    mock_org = MagicMock(spec=OrganizationModel)
    mock_org.id = org_id
    mock_org.name = "Sonangol Distribuidora"

    mock_dev = MagicMock(spec=DeviceModel)
    mock_dev.id = dev_id
    mock_dev.name = "FW-PERIMETER-01"
    mock_dev.organization_id = org_id

    # Incidente no dia 05 que dura 4 horas (penaliza SLA para ~83%)
    mock_inc = MagicMock(spec=IncidentModel)
    mock_inc.id = uuid4()
    mock_inc.device_id = dev_id
    mock_inc.started_at = datetime(2026, 10, 5, 2, 0, 0, tzinfo=UTC)
    mock_inc.resolved_at = datetime(2026, 10, 5, 6, 0, 0, tzinfo=UTC)

    # Janela de manutenção isenta no dia 12 (RFC-001)
    mw_id = uuid4()
    mock_mw = MagicMock(spec=MaintenanceWindowModel)
    mock_mw.id = mw_id
    mock_mw.device_id = dev_id
    mock_mw.organization_id = org_id
    mock_mw.start_time = datetime(2026, 10, 12, 1, 0, 0, tzinfo=UTC)
    mock_mw.end_time = datetime(2026, 10, 12, 3, 0, 0, tzinfo=UTC)
    mock_mw.is_approved = True
    mock_mw.description = "Upgrade de firmware de segurança"

    res_org = MagicMock()
    res_org.scalar_one_or_none.return_value = mock_org

    res_dev = MagicMock()
    res_dev.scalars.return_value.all.return_value = [mock_dev]

    res_inc = MagicMock()
    res_inc.scalars.return_value.all.return_value = [mock_inc]

    res_mw = MagicMock()
    res_mw.scalars.return_value.all.return_value = [mock_mw]

    session.execute.side_effect = [res_org, res_dev, res_inc, res_mw]

    result = await service.get_organization_daily_sla(
        organization_id=org_id,
        year=2026,
        month=10,
        target_pct=99.50,
    )

    day_5 = result.days[4]  # Dia 05
    assert day_5.day == "05"
    assert day_5.type == "incident"
    assert day_5.uptime_pct < 99.50
    assert "Incidente registrado" in day_5.note
    assert day_5.incidents_count == 1

    day_12 = result.days[11]  # Dia 12
    assert day_12.day == "12"
    assert day_12.type == "maint"
    assert f"RFC-{str(mw_id)[:8].upper()}" in day_12.note
    assert day_12.maintenance_count == 1


@pytest.mark.asyncio
async def test_get_organization_daily_sla_mes_invalido():
    session = AsyncMock()
    service = SlaService(session)

    with pytest.raises(ValueError, match="Mês inválido"):
        await service.get_organization_daily_sla(
            organization_id=uuid4(),
            year=2026,
            month=13,
        )
