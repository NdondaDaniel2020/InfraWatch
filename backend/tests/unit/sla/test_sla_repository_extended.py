"""Testes unitários para MaintenanceWindowRepository e funções utilitárias de SLA."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.sla.database.repository import (
    MaintenanceWindowRepository,
    _to_domain_safe,
)
from src.contexts.sla.domain.models import MaintenanceWindow


def test_to_domain_safe() -> None:
    """Valida conversão segura de modelo SQLAlchemy para entidade de domínio MaintenanceWindow."""
    now = datetime.now(UTC)
    org_id = uuid4()
    win_id = uuid4()

    # 1. Objeto já é MaintenanceWindow
    domain_win = MaintenanceWindow(
        id=win_id,
        organization_id=org_id,
        description="Janela 1",
        start_time=now,
        end_time=now + timedelta(hours=2),
    )
    assert _to_domain_safe(domain_win) is domain_win

    # 2. Objeto possui to_domain()
    mock_model = MagicMock()
    mock_model.to_domain.return_value = domain_win
    assert _to_domain_safe(mock_model) is domain_win

    # 3. Fallback via atributos
    fallback_model = MagicMock(spec=[])
    fallback_model.id = win_id
    fallback_model.organization_id = None
    fallback_model.title = "Janela Fallback"
    fallback_model.description = "Janela Fallback"
    fallback_model.start_time = now
    fallback_model.end_time = now + timedelta(hours=1)
    fallback_model.is_approved = True
    fallback_model.device_id = None
    fallback_model.reason = "Motivo"

    res = _to_domain_safe(fallback_model, fallback_org_id=org_id)
    assert res.id == win_id
    assert res.organization_id == org_id


@pytest.mark.asyncio
async def test_maintenance_window_repository_crud() -> None:
    """Valida get_by_id, save e delete em MaintenanceWindowRepository."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    repo = MaintenanceWindowRepository(mock_session)

    win_id = uuid4()
    org_id = uuid4()
    now = datetime.now(UTC)
    domain_win = MaintenanceWindow(
        id=win_id,
        organization_id=org_id,
        description="Parada Programada",
        start_time=now,
        end_time=now + timedelta(hours=2),
    )

    # 1. get_by_id encontrado e não encontrado
    mock_model = MagicMock()
    mock_model.to_domain.return_value = domain_win
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_model
    mock_session.execute.return_value = mock_result

    res = await repo.get_by_id(win_id)
    assert res == domain_win

    mock_result.scalar_one_or_none.return_value = None
    res_none = await repo.get_by_id(win_id)
    assert res_none is None

    # 2. save (insert e update)
    mock_result.scalar_one_or_none.return_value = None
    await repo.save(domain_win)
    mock_session.add.assert_called_once()
    mock_session.flush.assert_called_once()

    mock_result.scalar_one_or_none.return_value = mock_model
    await repo.save(domain_win)
    mock_model.update_from_domain.assert_called_once_with(domain_win)

    # 3. delete (sucesso e falha)
    del_result = MagicMock(rowcount=1)
    mock_session.execute.return_value = del_result
    assert await repo.delete(win_id) is True

    del_result_zero = MagicMock(rowcount=0)
    mock_session.execute.return_value = del_result_zero
    assert await repo.delete(win_id) is False


@pytest.mark.asyncio
async def test_maintenance_window_repository_queries_and_kpis() -> None:
    """Valida list_windows, find_overlapping, get_kpis e find_for_sla_period."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    repo = MaintenanceWindowRepository(mock_session)

    win_id = uuid4()
    org_id = uuid4()
    dev_id = uuid4()
    now = datetime.now(UTC)
    domain_win = MaintenanceWindow(
        id=win_id,
        organization_id=org_id,
        device_id=dev_id,
        description="Manutenção Switch",
        start_time=now,
        end_time=now + timedelta(hours=3),
        is_approved=True,
    )
    mock_model = MagicMock()
    mock_model.to_domain.return_value = domain_win

    # 1. list_windows
    count_res = MagicMock()
    count_res.scalar_one.return_value = 1
    items_res = MagicMock()
    items_res.scalars.return_value.all.return_value = [mock_model]
    mock_session.execute.side_effect = [count_res, items_res]

    items, total = await repo.list_windows(
        organization_id=org_id,
        device_id=dev_id,
        is_approved=True,
    )
    assert total == 1
    assert len(items) == 1

    # 2. find_overlapping
    overlap_res = MagicMock()
    overlap_res.scalars.return_value.all.return_value = [mock_model]
    mock_session.execute.side_effect = None
    mock_session.execute.return_value = overlap_res

    overlaps = await repo.find_overlapping(
        start_time=now,
        end_time=now + timedelta(hours=4),
        device_id=dev_id,
        approved_only=True,
    )
    assert len(overlaps) == 1

    # 3. get_kpis
    kpi_active_res = MagicMock()
    kpi_active_res.scalar_one.return_value = 2
    kpi_sched_res = MagicMock()
    kpi_sched_res.scalar_one.return_value = 5
    kpi_exempt_res = MagicMock()
    kpi_exempt_res.scalars.return_value.all.return_value = [mock_model]
    mock_session.execute.side_effect = [kpi_active_res, kpi_sched_res, kpi_exempt_res]

    active, sched, exempted = await repo.get_kpis(
        now=now,
        start_of_month=now - timedelta(days=10),
        organization_id=org_id,
    )
    assert active == 2
    assert sched == 5
    assert len(exempted) == 1

    # 4. find_for_sla_period
    sla_period_res = MagicMock()
    sla_period_res.scalars.return_value.all.return_value = [mock_model]
    mock_session.execute.side_effect = None
    mock_session.execute.return_value = sla_period_res

    sla_wins = await repo.find_for_sla_period(
        month_start=now - timedelta(days=30),
        month_end=now,
        organization_id=org_id,
        device_ids=[dev_id],
    )
    assert len(sla_wins) == 1
