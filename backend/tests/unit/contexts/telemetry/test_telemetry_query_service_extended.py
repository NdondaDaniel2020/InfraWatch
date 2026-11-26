"""Testes unitários estendidos para TelemetryQueryService (métricas recentes e séries temporais)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.telemetry.services.telemetry_query_service import (
    TelemetryDeviceNotFoundError,
    TelemetryQueryService,
)


@pytest.fixture
def mock_session():
    session = AsyncMock()
    return session


@pytest.fixture
def mock_telemetry_repo():
    repo = MagicMock()
    repo.get_latest_metrics_by_devices = AsyncMock()
    repo.get_timescale_metrics = AsyncMock()
    return repo


@pytest.mark.asyncio
async def test_get_latest_metrics_for_devices(mock_session, mock_telemetry_repo) -> None:
    """Valida agregação de métricas recentes de latência, perda, cpu e memória."""
    service = TelemetryQueryService(
        session=mock_session,
        telemetry_repo=mock_telemetry_repo,
    )

    # 1. Lista vazia
    assert await service.get_latest_metrics_for_devices([]) == {}

    # 2. Métricas populadas
    dev1_id = uuid4()
    dev2_id = uuid4()

    m_lat = MagicMock(device_id=dev1_id, metric_type="latency_ms")
    m_lat.value = 12.34
    m_lat.packet_loss = None

    m_loss = MagicMock(device_id=dev1_id, metric_type="packet_loss")
    m_loss.value = 0.0
    m_loss.packet_loss = None

    m_cpu = MagicMock(device_id=dev2_id, metric_type="cpu_usage")
    m_cpu.value = 45.67
    m_cpu.packet_loss = None

    m_mem = MagicMock(device_id=dev2_id, metric_type="memory_usage")
    m_mem.value = 78.9
    m_mem.packet_loss = None

    mock_telemetry_repo.get_latest_metrics_by_devices.return_value = [m_lat, m_loss, m_cpu, m_mem]

    res = await service.get_latest_metrics_for_devices([dev1_id, dev2_id])
    assert res[dev1_id]["latency_ms"] == 12.3
    assert res[dev1_id]["packet_loss"] == 0.0
    assert res[dev2_id]["cpu_usage"] == 45.7
    assert res[dev2_id]["mem_usage"] == 78.9


@pytest.mark.asyncio
async def test_get_device_timescale_buckets(mock_session, mock_telemetry_repo) -> None:
    """Valida consulta de séries temporais de métricas para gráficos."""
    mock_device_repo = MagicMock()
    service = TelemetryQueryService(
        session=mock_session,
        device_repo=mock_device_repo,
        telemetry_repo=mock_telemetry_repo,
    )

    dev_id = uuid4()
    mock_telemetry_repo.get_timescale_buckets = AsyncMock(
        return_value=[{"time": "2026-11-26T12:00:00Z", "avg_latency": 15.0}]
    )

    points = await service.get_device_timescale_buckets(
        device_id=dev_id,
        period="24h",
    )
    assert len(points) == 1
    assert points[0]["avg_latency"] == 15.0


@pytest.mark.asyncio
async def test_get_monitored_device_detail_and_list_devices(
    mock_session, mock_telemetry_repo
) -> None:
    """Valida get_monitored_device_detail e list_monitored_devices com regras de multitenancy."""
    from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
    from src.contexts.iam.domain.enums import UserRole

    mock_device_repo = MagicMock()
    service = TelemetryQueryService(
        session=mock_session,
        device_repo=mock_device_repo,
        telemetry_repo=mock_telemetry_repo,
    )

    org_id = uuid4()
    dev_id = uuid4()
    now = datetime.now(UTC)

    user = AuthenticatedUser(
        id=str(uuid4()),
        email="viewer@client.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(org_id),
    )

    mock_dev = MagicMock()
    mock_dev.id = dev_id
    mock_dev.organization_id = org_id
    mock_dev.name = "Server 01"
    mock_dev.hostname = "srv01.lan"
    mock_dev.ip_address = "10.0.0.10"
    mock_dev.port = 80
    mock_dev.protocol = "HTTP"
    mock_dev.category = "SERVER"
    mock_dev.status = "ONLINE"
    mock_dev.is_paused = False
    mock_dev.interval_seconds = 30
    mock_dev.thresholds = {}
    mock_device_repo.find_by_id = AsyncMock(return_value=mock_dev)

    # 1. get_monitored_device_detail sucesso
    mock_metric = MagicMock(
        metric_type="latency_ms",
        value=14.2,
        packet_loss=0.0,
        status="OK",
        timestamp=now,
    )
    mock_telemetry_repo.get_recent_metrics_for_device = AsyncMock(return_value=[mock_metric])

    detail = await service.get_monitored_device_detail(dev_id, current_user=user)
    assert detail.name == "Server 01"
    assert detail.last_latency_ms == 14.2

    # 2. get_monitored_device_detail não encontrado ou org divergente
    mock_device_repo.find_by_id = AsyncMock(return_value=None)
    with pytest.raises(TelemetryDeviceNotFoundError):
        await service.get_monitored_device_detail(dev_id, current_user=user)

    other_user = AuthenticatedUser(
        id=str(uuid4()),
        email="other@corp.ao",
        role=UserRole.CLIENT_VIEWER.value,
        organization_id=str(uuid4()),
    )
    mock_device_repo.find_by_id = AsyncMock(return_value=mock_dev)
    with pytest.raises(TelemetryDeviceNotFoundError):
        await service.get_monitored_device_detail(dev_id, current_user=other_user)

    # 3. list_monitored_devices
    mock_device_repo.list_devices = AsyncMock(return_value=([mock_dev], 1))
    mock_telemetry_repo.get_latest_metrics_by_devices = AsyncMock(return_value=[mock_metric])
    service._topology_repo = MagicMock()
    service._topology_repo.get_clusters_by_device_ids = AsyncMock(return_value={})

    list_res = await service.list_monitored_devices(current_user=user)
    assert list_res.total == 1
    assert len(list_res.items) == 1
    assert list_res.items[0].name == "Server 01"
