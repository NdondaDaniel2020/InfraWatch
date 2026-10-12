"""Testes unitários do executor DockerProber via Docker Engine API."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest

from src.workers.probers.docker import DockerProber
from src.workers.probers.executor import ProbeExecutor
from src.workers.scheduler.in_memory_inventory import ProbeTarget


@pytest.fixture
def docker_target() -> ProbeTarget:
    return ProbeTarget(
        device_id=uuid4(),
        organization_id=uuid4(),
        name="infrawatch-postgres",
        ip_address="infrawatch-postgres",
        port=0,
        protocol="docker",
        category="CONTAINER",
        interval_seconds=30,
    )


@pytest.fixture
def healthy_inspect_payload() -> dict:
    return {
        "Id": "abc123containerid",
        "Name": "/infrawatch-postgres",
        "State": {
            "Status": "running",
            "Running": True,
            "Paused": False,
            "Restarting": False,
            "OOMKilled": False,
            "Dead": False,
            "ExitCode": 0,
            "Error": "",
        },
        "RestartCount": 0,
    }


@pytest.fixture
def healthy_stats_payload() -> dict:
    return {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 200000000},
            "system_cpu_usage": 1000000000,
            "online_cpus": 2,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 100000000},
            "system_cpu_usage": 500000000,
        },
        "memory_stats": {
            "usage": 104857600,  # 100 MB
            "limit": 1073741824,  # 1 GB
            "stats": {"inactive_file": 0},
        },
    }


@pytest.mark.asyncio
async def test_docker_prober_healthy_container(
    docker_target: ProbeTarget,
    healthy_inspect_payload: dict,
    healthy_stats_payload: dict,
) -> None:
    prober = DockerProber()

    inspect_resp = httpx.Response(200, json=healthy_inspect_payload)
    stats_resp = httpx.Response(200, json=healthy_stats_payload)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = [inspect_resp, stats_resp]

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "UP"
    assert result.packet_loss_pct == 0.0
    assert result.latency_ms > 0.0
    assert result.extra_data is not None
    assert result.extra_data["cpu_usage_pct"] == 40.0
    assert result.extra_data["memory_usage_pct"] == 9.77
    assert result.extra_data["oom_killed"] is False
    assert result.error_message is None


@pytest.mark.asyncio
async def test_docker_prober_degraded_high_cpu(
    docker_target: ProbeTarget,
    healthy_inspect_payload: dict,
) -> None:
    prober = DockerProber()

    # 95% CPU usage
    high_cpu_stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 1950000000},
            "system_cpu_usage": 2000000000,
            "online_cpus": 1,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 1000000000},
            "system_cpu_usage": 1000000000,
        },
        "memory_stats": {
            "usage": 52428800,
            "limit": 1073741824,
            "stats": {},
        },
    }

    inspect_resp = httpx.Response(200, json=healthy_inspect_payload)
    stats_resp = httpx.Response(200, json=high_cpu_stats)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = [inspect_resp, stats_resp]

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "DEGRADED"
    assert result.packet_loss_pct == 0.0
    assert result.extra_data is not None
    assert result.extra_data["cpu_usage_pct"] == 95.0
    assert "Alto consumo" in (result.error_message or "")


@pytest.mark.asyncio
async def test_docker_prober_restarting_container(
    docker_target: ProbeTarget,
) -> None:
    prober = DockerProber()

    inspect_payload = {
        "State": {
            "Status": "restarting",
            "Running": False,
            "Restarting": True,
            "OOMKilled": False,
            "ExitCode": 1,
        },
        "RestartCount": 5,
    }

    inspect_resp = httpx.Response(200, json=inspect_payload)
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = inspect_resp

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "DEGRADED"
    assert result.packet_loss_pct == 50.0
    assert result.extra_data is not None
    assert result.extra_data["restart_count"] == 5
    assert "reinicialização contínua" in (result.error_message or "")


@pytest.mark.asyncio
async def test_docker_prober_oom_killed_container(
    docker_target: ProbeTarget,
) -> None:
    prober = DockerProber()

    inspect_payload = {
        "State": {
            "Status": "exited",
            "Running": False,
            "Restarting": False,
            "OOMKilled": True,
            "ExitCode": 137,
        },
        "RestartCount": 1,
    }

    inspect_resp = httpx.Response(200, json=inspect_payload)
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = inspect_resp

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "DOWN"
    assert result.packet_loss_pct == 100.0
    assert result.extra_data is not None
    assert result.extra_data["oom_killed"] is True
    assert "OOMKilled" in (result.error_message or "")


@pytest.mark.asyncio
async def test_docker_prober_container_not_found_404(
    docker_target: ProbeTarget,
) -> None:
    prober = DockerProber()

    inspect_resp = httpx.Response(404, json={"message": "No such container"})
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = inspect_resp

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "DOWN"
    assert result.packet_loss_pct == 100.0
    assert "não encontrado" in (result.error_message or "")


@pytest.mark.asyncio
async def test_docker_prober_connect_error(
    docker_target: ProbeTarget,
) -> None:
    prober = DockerProber()

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.ConnectError("Socket /var/run/docker.sock not found")

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "DOWN"
    assert result.packet_loss_pct == 100.0
    assert "Falha de conexão" in (result.error_message or "")


@pytest.mark.asyncio
async def test_docker_prober_timeout(
    docker_target: ProbeTarget,
) -> None:
    prober = DockerProber()

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Read timed out")

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "TIMEOUT"
    assert result.packet_loss_pct == 100.0
    assert "Tempo limite" in (result.error_message or "")


@pytest.mark.asyncio
async def test_probe_executor_dispatches_docker(
    docker_target: ProbeTarget,
    healthy_inspect_payload: dict,
    healthy_stats_payload: dict,
) -> None:
    executor = ProbeExecutor(max_concurrent=10)
    assert "docker" in executor.probers
    assert isinstance(executor.probers["docker"], DockerProber)

    inspect_resp = httpx.Response(200, json=healthy_inspect_payload)
    stats_resp = httpx.Response(200, json=healthy_stats_payload)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = [inspect_resp, stats_resp]

    docker_prober = executor.probers["docker"]
    with patch.object(docker_prober, "_get_client", return_value=mock_client):
        result = await executor.execute(docker_target)

    assert result.status == "UP"
