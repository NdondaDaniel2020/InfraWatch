"""Testes unitários estendidos para DeviceRepository (Inventory)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.inventory.database.models import DeviceModel
from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.inventory.schemas.filters import DeviceFilters


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()
    session.bind = MagicMock()
    session.bind.dialect.name = "postgresql"
    return session


@pytest.mark.asyncio
async def test_find_by_ids_and_names(mock_session) -> None:
    """Valida busca por lista de IDs e mapeamento de nomes."""
    repo = DeviceRepository(session=mock_session)
    dev1_id = uuid4()
    dev2_id = uuid4()
    org_id = uuid4()
    now = datetime.now(UTC)

    # 1. Lista vazia retorna vazio sem bater no banco
    assert await repo.find_by_ids([]) == []
    assert await repo.get_names_by_ids([]) == {}

    m1 = DeviceModel(
        id=dev1_id,
        organization_id=org_id,
        name="Switch A",
        ip_address="10.0.0.1",
        port=161,
        protocol="snmp",
        category="SWITCH",
        interval_seconds=30,
        thresholds={},
        status="UP",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )
    m2 = DeviceModel(
        id=dev2_id,
        organization_id=org_id,
        name="Switch B",
        ip_address="10.0.0.2",
        port=161,
        protocol="snmp",
        category="SWITCH",
        interval_seconds=30,
        thresholds={},
        status="UP",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )

    # 2. find_by_ids com retorno
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [m1, m2]
    mock_session.execute.return_value = res_mock

    devices = await repo.find_by_ids([dev1_id, dev2_id], organization_id=org_id)
    assert len(devices) == 2
    assert devices[0].name == "Switch A"

    # 3. get_names_by_ids
    names_mock = MagicMock()
    names_mock.all.return_value = [(dev1_id, "Switch A"), (dev2_id, "Switch B")]
    mock_session.execute.return_value = names_mock

    names = await repo.get_names_by_ids([dev1_id, dev2_id])
    assert names[dev1_id] == "Switch A"
    assert names[dev2_id] == "Switch B"


@pytest.mark.asyncio
async def test_find_by_organization_and_list_devices(mock_session) -> None:
    """Valida listagem de dispositivos por organização com contagem paginada."""
    repo = DeviceRepository(session=mock_session)
    org_id = uuid4()
    now = datetime.now(UTC)

    m = DeviceModel(
        id=uuid4(),
        organization_id=org_id,
        name="Router Edge",
        ip_address="192.168.1.1",
        port=22,
        protocol="ssh",
        category="ROUTER",
        interval_seconds=60,
        thresholds={},
        status="ONLINE",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )

    # 1. find_by_organization
    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [m]
    mock_session.execute.return_value = res_mock

    org_devices = await repo.find_by_organization(org_id)
    assert len(org_devices) == 1
    assert org_devices[0].name == "Router Edge"

    # 2. list_devices com filtro de status e contagem
    count_mock = MagicMock()
    count_mock.scalar_one.return_value = 1
    items_mock = MagicMock()
    items_mock.scalars.return_value.all.return_value = [m]
    mock_session.execute.side_effect = [count_mock, items_mock]

    items, total = await repo.list_devices(
        organization_id=org_id, status_filter="ONLINE", limit=10, offset=0
    )
    assert total == 1
    assert len(items) == 1


@pytest.mark.asyncio
async def test_list_with_filters_and_search(mock_session) -> None:
    """Valida list_with_filters abrangendo filtros de status, categoria, pausa e busca textual."""
    repo = DeviceRepository(session=mock_session)
    org_id = uuid4()
    now = datetime.now(UTC)

    m = DeviceModel(
        id=uuid4(),
        organization_id=org_id,
        name="Firewall DMZ",
        ip_address="172.16.1.1",
        port=443,
        protocol="https",
        category="FIREWALL",
        interval_seconds=15,
        thresholds={},
        status="DEGRADED",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )

    count_mock = MagicMock()
    count_mock.scalar_one.return_value = 1
    scalars_mock = MagicMock()
    scalars_mock.scalars.return_value.all.return_value = [m]

    # Testar filtros: PAUSED, MAINTENANCE, DEGRADED, UP, DOWN
    for test_status in ["PAUSED", "MAINTENANCE", "DEGRADED", "UP", "DOWN", "ONLINE"]:
        mock_session.execute.side_effect = [count_mock, scalars_mock]
        filters = DeviceFilters(
            search="DMZ",
            status=test_status,
            category="FIREWALL",
            protocol="https",
            is_paused=False,
        )
        res, total = await repo.list_with_filters(organization_id=org_id, filters=filters)
        assert total == 1
        assert len(res) == 1

    # Testar search_devices_paginated
    mock_session.execute.side_effect = [count_mock, scalars_mock]
    search_res, search_total = await repo.search_devices_paginated(
        organization_id=org_id,
        query="Firewall",
        limit=10,
        offset=0,
    )
    assert search_total == 1
    assert len(search_res) == 1
