"""Testes unitários para o DeviceQueryService (Inventory)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.contexts.inventory.schemas.filters import DeviceFilters
from src.contexts.inventory.services.device_query_service import DeviceQueryService
from src.core.web.pagination import PaginationParams


@pytest.mark.asyncio
async def test_list_and_search_devices() -> None:
    """Valida listagem e busca com paginação e modo visualizador (is_viewer)."""
    mock_session = AsyncMock()
    mock_repo = AsyncMock()
    service = DeviceQueryService(session=mock_session, repository=mock_repo)

    device_id = uuid4()
    org_id = uuid4()
    now = datetime.now(UTC)
    mock_device = {
        "id": device_id,
        "organization_id": org_id,
        "name": "Firewall Principal",
        "ip_address": "172.16.0.1",
        "port": 443,
        "protocol": "HTTP",
        "category": "FIREWALL",
        "status": "ONLINE",
        "interval_seconds": 30,
        "is_paused": False,
        "maintenance_until": None,
        "created_at": now,
        "updated_at": now,
    }

    mock_repo.list_with_filters.return_value = ([mock_device], 1)
    mock_repo.search_devices_paginated.return_value = ([mock_device], 1)

    filters = DeviceFilters()
    pagination = PaginationParams(page=1, page_size=10)

    # 1. List normal
    res = await service.list_devices(org_id, filters, pagination, is_viewer=False)
    assert res.total == 1
    assert len(res.items) == 1
    assert res.items[0].name == "Firewall Principal"

    # 2. List viewer (dados mascarados)
    res_viewer = await service.list_devices(org_id, filters, pagination, is_viewer=True)
    assert res_viewer.total == 1
    assert "***" in res_viewer.items[0].ip_address

    # 3. Search devices
    search_res = await service.search_devices(org_id, "Firewall", pagination)
    assert search_res.total == 1


@pytest.mark.asyncio
async def test_get_device_detail() -> None:
    """Valida consulta detalhada de dispositivo."""
    mock_session = AsyncMock()
    mock_repo = AsyncMock()
    service = DeviceQueryService(session=mock_session, repository=mock_repo)

    device_id = uuid4()
    org_id = uuid4()

    # 1. Dispositivo inexistente
    mock_repo.get_by_id.return_value = None
    detail_none = await service.get_device_detail(org_id, device_id)
    assert detail_none is None

    # 2. Dispositivo existente
    now = datetime.now(UTC)
    mock_device = {
        "id": device_id,
        "organization_id": org_id,
        "name": "Core Switch",
        "hostname": "switch-01.lan",
        "ip_address": "10.0.0.2",
        "port": 22,
        "protocol": "TCP",
        "category": "SWITCH",
        "status": "ONLINE",
        "interval_seconds": 60,
        "is_paused": False,
        "maintenance_until": None,
        "created_at": now,
        "updated_at": now,
    }
    mock_repo.get_by_id.return_value = mock_device

    detail = await service.get_device_detail(org_id, device_id, is_viewer=False)
    assert detail is not None
    assert detail.name == "Core Switch"
