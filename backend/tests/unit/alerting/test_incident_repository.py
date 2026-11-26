"""Testes unitários para IncidentRepository."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.alerting.database.repository import IncidentRepository
from src.contexts.alerting.domain.incident import Incident, IncidentStatus


@pytest.mark.asyncio
async def test_incident_repository_crud() -> None:
    """Valida get_by_id e save em IncidentRepository."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    repo = IncidentRepository(mock_session)

    incident_id = uuid4()
    org_id = uuid4()
    device_id = uuid4()
    now = datetime.now(UTC)

    incident = Incident(
        id=incident_id,
        device_id=device_id,
        organization_id=org_id,
        title="Host Inacessível",
        status=IncidentStatus.TRIGGERED,
        started_at=now,
    )

    # 1. get_by_id
    mock_model = MagicMock()
    mock_model.to_domain.return_value = incident
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_model
    mock_session.execute.return_value = mock_result

    res = await repo.get_by_id(incident_id)
    assert res == incident

    mock_result.scalar_one_or_none.return_value = None
    assert await repo.get_by_id(incident_id) is None

    # 2. save (novo)
    mock_result.scalar_one_or_none.return_value = None
    with patch(
        "src.contexts.alerting.database.models.IncidentModel.from_domain", return_value=mock_model
    ):
        await repo.save(incident)
        mock_session.add.assert_called_with(mock_model)

    # save (existente)
    mock_result.scalar_one_or_none.return_value = mock_model
    await repo.save(incident)
    mock_model.update_from_domain.assert_called_with(incident)


from unittest.mock import patch


@pytest.mark.asyncio
async def test_incident_repository_queries() -> None:
    """Valida list_incidents, find_open_by_device e list_for_sla."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    repo = IncidentRepository(mock_session)

    incident_id = uuid4()
    org_id = uuid4()
    device_id = uuid4()
    now = datetime.now(UTC)

    incident = Incident(
        id=incident_id,
        device_id=device_id,
        organization_id=org_id,
        title="Ping Timeout",
        status=IncidentStatus.TRIGGERED,
        started_at=now,
    )
    mock_model = MagicMock()
    mock_model.to_domain.return_value = incident

    # 1. list_incidents
    count_res = MagicMock()
    count_res.scalar_one.return_value = 1
    items_res = MagicMock()
    items_res.scalars.return_value.all.return_value = [mock_model]
    mock_session.execute.side_effect = [count_res, items_res]

    items, total = await repo.list_incidents(
        organization_id=org_id,
        status="TRIGGERED",
        device_id=device_id,
    )
    assert total == 1
    assert len(items) == 1

    # 2. find_open_by_device
    mock_session.execute.side_effect = None
    single_res = MagicMock()
    single_res.scalar_one_or_none.return_value = mock_model
    mock_session.execute.return_value = single_res

    open_inc = await repo.find_open_by_device(device_id)
    assert open_inc == incident

    # 3. list_for_sla
    assert await repo.list_for_sla([], now, now + timedelta(days=1)) == []

    sla_res = MagicMock()
    sla_res.scalars.return_value.all.return_value = [
        incident,
        mock_model,
        MagicMock(
            started_at=now,
            resolved_at=None,
            id=uuid4(),
            device_id=device_id,
            organization_id=org_id,
            title="Fallback",
        ),
    ]
    mock_session.execute.return_value = sla_res

    sla_items = await repo.list_for_sla(
        [device_id], now - timedelta(days=1), now + timedelta(days=1)
    )
    assert len(sla_items) >= 2
