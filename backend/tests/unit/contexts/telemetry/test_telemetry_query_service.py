"""Testes unitários para o TelemetryQueryService com desacoplamento de repositórios."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.inventory.domain.aggregate import Device
from src.contexts.telemetry.services.telemetry_query_service import (
    TelemetryDeviceNotFoundError,
    TelemetryQueryService,
)


@pytest.fixture
def mock_session():
    session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = []
    mock_res.all.return_value = []
    session.execute.return_value = mock_res
    return session


@pytest.fixture
def mock_device_repo():
    repo = MagicMock()
    repo.list_devices = AsyncMock(return_value=([], 0))
    repo.find_by_id = AsyncMock(return_value=None)
    return repo


@pytest.fixture
def mock_topology_repo():
    repo = MagicMock()
    repo.get_clusters_by_device_ids = AsyncMock(return_value={})
    return repo


@pytest.fixture
def service(mock_session, mock_device_repo, mock_topology_repo):
    return TelemetryQueryService(
        session=mock_session,
        device_repo=mock_device_repo,
        topology_repo=mock_topology_repo,
    )


@pytest.mark.asyncio
async def test_list_monitored_devices_empty(service, mock_device_repo):
    org_id = uuid4()
    user = AuthenticatedUser(
        id=str(uuid4()),
        email="operator@infrawatch.io",
        role="TENANT_ADMIN",
        organization_id=str(org_id),
    )

    res = await service.list_monitored_devices(current_user=user)
    assert res.total == 0
    assert res.items == []
    mock_device_repo.list_devices.assert_awaited_once_with(
        organization_id=org_id,
        status_filter=None,
        limit=50,
        offset=0,
    )


@pytest.mark.asyncio
async def test_list_monitored_devices_with_items(service, mock_device_repo, mock_topology_repo):
    org_id = uuid4()
    dev_id = uuid4()
    dev = Device(
        id=dev_id,
        organization_id=org_id,
        name="Core-SW01",
        ip_address="10.1.1.1",
        port=80,
        protocol="icmp",
        category="SWITCH",
        interval_seconds=30,
        thresholds={"datacenter": "DC-PRIMARY"},
    )
    mock_device_repo.list_devices.return_value = ([dev], 1)
    mock_topology_repo.get_clusters_by_device_ids.return_value = {dev_id: "DC-LUANDA"}

    user = AuthenticatedUser(
        id=str(uuid4()),
        email="global@infrawatch.io",
        role="SUPER_ADMIN",
        organization_id=None,
    )

    res = await service.list_monitored_devices(current_user=user, organization_id=org_id)
    assert res.total == 1
    assert len(res.items) == 1
    assert res.items[0].device_id == dev_id
    assert res.items[0].name == "Core-SW01"
    assert res.items[0].datacenter_region == "DC-LUANDA"


@pytest.mark.asyncio
async def test_get_monitored_device_detail_not_found(service, mock_device_repo):
    user = AuthenticatedUser(
        id=str(uuid4()),
        email="user@infrawatch.io",
        role="CLIENT_VIEWER",
        organization_id=str(uuid4()),
    )
    with pytest.raises(TelemetryDeviceNotFoundError):
        await service.get_monitored_device_detail(device_id=uuid4(), current_user=user)


@pytest.mark.asyncio
async def test_get_monitored_device_detail_success(service, mock_device_repo):
    org_id = uuid4()
    dev_id = uuid4()
    dev = Device(
        id=dev_id,
        organization_id=org_id,
        name="Firewall-01",
        ip_address="192.168.1.1",
        port=443,
        protocol="https",
        category="FIREWALL",
        interval_seconds=60,
        thresholds={},
    )
    mock_device_repo.find_by_id.return_value = dev

    user = AuthenticatedUser(
        id=str(uuid4()),
        email="user@infrawatch.io",
        role="TENANT_ADMIN",
        organization_id=str(org_id),
    )

    detail = await service.get_monitored_device_detail(device_id=dev_id, current_user=user)
    assert detail.device_id == dev_id
    assert detail.name == "Firewall-01"
    assert detail.ip_address == "192.168.1.1"
