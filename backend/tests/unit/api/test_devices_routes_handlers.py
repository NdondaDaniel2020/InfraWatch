"""Testes unitários para route handlers de Dispositivos (Inventory API)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.inventory.api.routes.devices import (
    create_device,
    get_device,
    list_devices,
    pause_device,
    resume_device,
    set_maintenance,
    update_device,
)
from src.contexts.inventory.schemas.device_schemas import DeviceDetail, DeviceListItem
from src.contexts.inventory.schemas.filters import DeviceFilters
from src.contexts.inventory.schemas.requests import (
    CreateDeviceRequest,
    SetMaintenanceRequest,
    UpdateDeviceRequest,
)
from src.core.web.pagination import PaginatedResponse, PaginationParams


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id=str(uuid4()),
        email="noc@corp.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=str(uuid4()),
    )


@pytest.fixture
def sample_detail():
    now = datetime.now(UTC)
    return DeviceDetail(
        id=uuid4(),
        organization_id=uuid4(),
        name="Router BGP",
        hostname="rt-bgp.lan",
        ip_address="192.168.1.1",
        port=22,
        protocol="ssh",
        category="ROUTER",
        interval_seconds=30,
        status="ONLINE",
        is_paused=False,
        maintenance_until=None,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_create_device_handlers(current_user, sample_detail) -> None:
    """Valida cadastro de dispositivos com resolução de tenancy."""
    mock_command = AsyncMock()
    mock_query = AsyncMock()
    mock_query.get_device_detail.return_value = sample_detail

    # 1. Global operator com organization_id no payload
    req = CreateDeviceRequest(
        name="Router BGP",
        ip_address="192.168.1.1",
        protocol="ssh",
        category="ROUTER",
        interval_seconds=30,
        organization_id=sample_detail.organization_id,
    )
    mock_dev_entity = MagicMock(id=sample_detail.id)
    mock_command.create_device.return_value = mock_dev_entity

    created = await create_device(
        payload=req,
        user=current_user,
        client_ip="127.0.0.1",
        command_service=mock_command,
        query_service=mock_query,
    )
    assert created.name == "Router BGP"

    # 2. Global operator sem organization_id (400)
    user_no_org = AuthenticatedUser(
        id=str(uuid4()),
        email="admin@root.ao",
        role=UserRole.SUPER_ADMIN.value,
        organization_id=None,
    )
    req_no_org = CreateDeviceRequest(
        name="Router BGP",
        ip_address="192.168.1.1",
        protocol="ssh",
        category="ROUTER",
        interval_seconds=30,
    )
    with pytest.raises(HTTPException) as exc_400:
        await create_device(
            payload=req_no_org,
            user=user_no_org,
            client_ip="127.0.0.1",
            command_service=mock_command,
            query_service=mock_query,
        )
    assert exc_400.value.status_code == 400

    # 3. Org Admin criando para outra organização (403)
    user_org_admin = AuthenticatedUser(
        id=str(uuid4()),
        email="org@client.ao",
        role=UserRole.ORG_ADMIN.value,
        organization_id=str(uuid4()),
    )
    req_other_org = CreateDeviceRequest(
        name="Router BGP",
        ip_address="192.168.1.1",
        protocol="ssh",
        category="ROUTER",
        interval_seconds=30,
        organization_id=uuid4(),  # Outra org
    )
    with pytest.raises(HTTPException) as exc_403:
        await create_device(
            payload=req_other_org,
            user=user_org_admin,
            client_ip="127.0.0.1",
            command_service=mock_command,
            query_service=mock_query,
        )
    assert exc_403.value.status_code == 403


@pytest.mark.asyncio
async def test_list_and_get_device(current_user, sample_detail) -> None:
    """Valida consulta e busca de dispositivo único (com 404)."""
    mock_query = AsyncMock()

    # 1. list_devices
    mock_list_item = DeviceListItem(
        id=sample_detail.id,
        name=sample_detail.name,
        category=sample_detail.category,
        status=sample_detail.status,
        is_paused=sample_detail.is_paused,
        ip_address=sample_detail.ip_address,
        protocol=sample_detail.protocol,
    )
    paginated = PaginatedResponse(
        items=[mock_list_item], total=1, page=1, page_size=10, total_pages=1
    )
    mock_query.list_devices.return_value = paginated

    pagination = PaginationParams(page=1, page_size=10)
    filters = DeviceFilters()
    res = await list_devices(
        user=current_user,
        pagination=pagination,
        query_service=mock_query,
        filters=filters,
    )
    assert res.total == 1

    # 2. get_device sucesso
    mock_query.get_device_detail.return_value = sample_detail
    dev = await get_device(device_id=sample_detail.id, user=current_user, query_service=mock_query)
    assert dev.id == sample_detail.id

    # 3. get_device não encontrado (404)
    mock_query.get_device_detail.return_value = None
    with pytest.raises(HTTPException) as exc_404:
        await get_device(device_id=sample_detail.id, user=current_user, query_service=mock_query)
    assert exc_404.value.status_code == 404


@pytest.mark.asyncio
async def test_update_pause_resume_maintenance_handlers(current_user, sample_detail) -> None:
    """Valida operações de ciclo de vida do dispositivo."""
    mock_command = AsyncMock()
    mock_query = AsyncMock()
    mock_query.get_device_detail.return_value = sample_detail

    # 1. update_device
    up_req = UpdateDeviceRequest(name="Novo Nome")
    updated = await update_device(
        device_id=sample_detail.id,
        payload=up_req,
        user=current_user,
        client_ip="127.0.0.1",
        command_service=mock_command,
        query_service=mock_query,
    )
    assert updated.id == sample_detail.id

    # 2. pause_device
    paused = await pause_device(
        device_id=sample_detail.id,
        user=current_user,
        client_ip="127.0.0.1",
        command_service=mock_command,
        query_service=mock_query,
    )
    assert paused.id == sample_detail.id

    # 3. resume_device
    resumed = await resume_device(
        device_id=sample_detail.id,
        user=current_user,
        client_ip="127.0.0.1",
        command_service=mock_command,
        query_service=mock_query,
    )
    assert resumed.id == sample_detail.id

    # 4. set_maintenance
    maint_req = SetMaintenanceRequest(
        until=datetime.now(UTC) + timedelta(hours=2),
        reason="Manutenção programada",
    )
    maint = await set_maintenance(
        device_id=sample_detail.id,
        payload=maint_req,
        user=current_user,
        client_ip="127.0.0.1",
        command_service=mock_command,
        query_service=mock_query,
    )
    assert maint.id == sample_detail.id


@pytest.mark.asyncio
async def test_probe_and_search_endpoints(current_user, sample_detail) -> None:
    """Valida test_probe, search_devices, probe_device, get_device_interfaces e get_device_metrics."""
    from src.contexts.inventory.api.routes.devices import (
        get_device_interfaces,
        get_device_metrics,
        probe_device,
        search_devices,
        test_probe,
    )
    from src.contexts.inventory.schemas.requests import TestProbeRequest

    mock_command = AsyncMock()
    mock_query = AsyncMock()

    # 1. test_probe
    mock_command.execute_pre_check_probe.return_value = MagicMock(success=True)
    probe_req = TestProbeRequest(ip_address="10.0.0.1", protocol="ICMP")
    test_res = await test_probe(payload=probe_req, user=current_user, command_service=mock_command)
    assert test_res.success is True

    # 2. search_devices
    pagination = PaginationParams(page=1, page_size=10)
    mock_query.search_devices.return_value = PaginatedResponse(
        items=[],
        total=0,
        page=1,
        page_size=10,
        pages=0,
    )
    search_res = await search_devices(
        user=current_user, pagination=pagination, query_service=mock_query, q="Switch"
    )
    assert search_res.total == 0

    # 3. probe_device sucesso e 404
    mock_command.execute_on_demand_probe.return_value = MagicMock(success=True)
    probe_dev_res = await probe_device(
        device_id=sample_detail.id, user=current_user, command_service=mock_command
    )
    assert probe_dev_res.success is True

    mock_command.execute_on_demand_probe.return_value = None
    with pytest.raises(HTTPException) as exc_p404:
        await probe_device(
            device_id=sample_detail.id, user=current_user, command_service=mock_command
        )
    assert exc_p404.value.status_code == 404

    # 4. get_device_interfaces sucesso e 404
    mock_query.get_device_interfaces.return_value = []
    ifaces = await get_device_interfaces(
        device_id=sample_detail.id, user=current_user, query_service=mock_query
    )
    assert ifaces == []

    mock_query.get_device_interfaces.return_value = None
    with pytest.raises(HTTPException) as exc_if404:
        await get_device_interfaces(
            device_id=sample_detail.id, user=current_user, query_service=mock_query
        )
    assert exc_if404.value.status_code == 404

    # 5. get_device_metrics sucesso e 404
    mock_query.get_device_timescale_metrics.return_value = MagicMock(device_id=sample_detail.id)
    metrics_res = await get_device_metrics(
        device_id=sample_detail.id, user=current_user, query_service=mock_query
    )
    assert metrics_res.device_id == sample_detail.id

    mock_query.get_device_timescale_metrics.return_value = None
    with pytest.raises(HTTPException) as exc_m404:
        await get_device_metrics(
            device_id=sample_detail.id, user=current_user, query_service=mock_query
        )
    assert exc_m404.value.status_code == 404
