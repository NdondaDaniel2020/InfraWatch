"""Testes unitários do executor DockerProber via Docker Engine API."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest

from src.workers.probers.docker import DockerProber
from src.workers.probers.executor import ProbeExecutor
from src.workers.scheduler.in_memory_inventory import ProbeTarget


def _make_async_client_mock(inspect_resp: httpx.Response, stats_resp: httpx.Response) -> AsyncMock:
    """Cria mock de AsyncClient que suporta async with e side_effect por URL."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)

    async def mock_get(url: str, *args, **kwargs) -> httpx.Response:
        if "json" in url:
            return inspect_resp
        elif "stats" in url:
            return stats_resp
        return httpx.Response(404)

    mock_client.get.side_effect = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


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
            "Health": {
                "Status": "healthy",
                "FailingStreak": 0,
                "Log": [
                    {
                        "Start": "2026-10-13T12:00:00Z",
                        "End": "2026-10-13T12:00:01Z",
                        "ExitCode": 0,
                        "Output": "OK: accepting connections",
                    }
                ],
            },
        },
        "RestartCount": 0,
        "Config": {
            "Image": "postgres:16-alpine",
            "Labels": {
                "com.docker.compose.service": "postgres",
                "com.docker.compose.project": "infrawatch",
                "com.docker.compose.version": "5.5.1",
            },
        },
        "HostConfig": {
            "Memory": 1073741824,
            "MemorySwap": 2147483648,
            "CpuQuota": 50000,
            "CpuPeriod": 100000,
            "CpuShares": 1024,
            "CpusetCpus": "0,1",
            "PidsLimit": 100,
            "OomKillDisable": False,
        },
        "Mounts": [
            {
                "Type": "bind",
                "Source": "/host/path",
                "Destination": "/container/path",
                "Mode": "rw",
                "RW": True,
                "Driver": "local",
            },
            {
                "Type": "volume",
                "Source": "/var/lib/docker/volumes/data/_data",
                "Destination": "/data",
                "Mode": "rw",
                "RW": True,
                "Driver": "local",
            },
        ],
        "NetworkSettings": {
            "Networks": {
                "infrawatch_infrawatch-net": {
                    "IPAddress": "172.22.0.2",
                    "Gateway": "172.22.0.1",
                    "MacAddress": "02:42:ac:16:00:02",
                    "DNSNames": ["postgres", "infrawatch-postgres"],
                    "Aliases": ["postgres", "infrawatch-postgres"],
                }
            }
        },
    }


@pytest.fixture
def healthy_stats_payload() -> dict:
    return {
        "cpu_stats": {
            "cpu_usage": {
                "total_usage": 200000000,
                "usage_in_kernelmode": 50000000,
                "usage_in_usermode": 150000000,
            },
            "system_cpu_usage": 1000000000,
            "online_cpus": 2,
            "throttling_data": {
                "periods": 100,
                "throttled_periods": 5,
                "throttled_time": 1000000000,
            },
        },
        "precpu_stats": {
            "cpu_usage": {
                "total_usage": 100000000,
                "usage_in_kernelmode": 25000000,
                "usage_in_usermode": 75000000,
            },
            "system_cpu_usage": 500000000,
        },
        "memory_stats": {
            "usage": 104857600,
            "limit": 1073741824,
            "stats": {
                "inactive_file": 0,
                "pgfault": 1000000,
                "pgmajfault": 5000,
                "shmem": 10485760,
                "slab": 2097152,
                "slab_reclaimable": 1048576,
                "slab_unreclaimable": 1048576,
                "workingset_refault": 1000,
                "workingset_activate": 500,
                "workingset_nodereclaim": 100,
            },
        },
        "networks": {
            "eth0": {
                "rx_bytes": 1000000,
                "tx_bytes": 2000000,
                "rx_packets": 10000,
                "tx_packets": 15000,
                "rx_errors": 0,
                "tx_errors": 0,
                "rx_dropped": 0,
                "tx_dropped": 0,
            }
        },
        "blkio_stats": {
            "io_service_bytes_recursive": [
                {"major": 8, "minor": 0, "op": "read", "value": 50000000},
                {"major": 8, "minor": 0, "op": "write", "value": 30000000},
            ],
            "io_serviced_recursive": [
                {"major": 8, "minor": 0, "op": "read", "value": 10000},
                {"major": 8, "minor": 0, "op": "write", "value": 5000},
            ],
        },
        "pids_stats": {"current": 42, "limit": 100},
    }


@pytest.fixture
def minimal_inspect_payload() -> dict:
    """Payload mínimo sem health, sem networks, sem mounts."""
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
        "Config": {"Image": "postgres:16-alpine", "Labels": {}},
        "HostConfig": {},
        "Mounts": [],
        "NetworkSettings": {"Networks": {}},
    }


@pytest.fixture
def minimal_stats_payload() -> dict:
    """Payload mínimo de stats sem throttling, sem memory stats detalhados, sem network, sem blkio, sem pids."""
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
            "usage": 104857600,
            "limit": 1073741824,
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
    mock_client = _make_async_client_mock(inspect_resp, stats_resp)

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
    # Novas métricas
    assert result.extra_data["cpu_throttled_periods"] == 5
    assert result.extra_data["cpu_throttled_time_ns"] == 1000000000
    assert result.extra_data["memory_page_faults"] == 1000000
    assert result.extra_data["memory_major_faults"] == 5000
    assert result.extra_data["memory_shmem_bytes"] == 10485760
    assert result.extra_data["memory_slab_bytes"] == 2097152
    assert result.extra_data["network_rx_bytes"] == 1000000
    assert result.extra_data["network_tx_bytes"] == 2000000
    assert result.extra_data["network_rx_packets"] == 10000
    assert result.extra_data["network_tx_packets"] == 15000
    assert result.extra_data["blkio_read_bytes"] == 50000000
    assert result.extra_data["blkio_write_bytes"] == 30000000
    assert result.extra_data["blkio_read_ops"] == 10000
    assert result.extra_data["blkio_write_ops"] == 5000
    assert result.extra_data["pids_current"] == 42
    assert result.extra_data["pids_limit"] == 100
    assert result.extra_data["health_status"] == "healthy"
    assert "accepting connections" in result.extra_data["health_output"]
    assert result.extra_data["health_failing_streak"] == 0
    assert result.extra_data["image"] == "postgres:16-alpine"
    assert result.extra_data["compose_labels"]["com.docker.compose.service"] == "postgres"
    assert len(result.extra_data["mounts"]) == 2
    assert result.extra_data["memory_limit_bytes"] == 1073741824
    assert result.extra_data["cpu_quota"] == 50000
    assert result.extra_data["pids_limit_config"] == 100
    assert result.extra_data["container_network"]["ip_address"] == "172.22.0.2"
    assert result.extra_data["container_network"]["dns_names"] == [
        "postgres",
        "infrawatch-postgres",
    ]


@pytest.mark.asyncio
async def test_docker_prober_minimal_payload(
    docker_target: ProbeTarget,
    minimal_inspect_payload: dict,
    minimal_stats_payload: dict,
) -> None:
    """Testa resiliência com payloads mínimos (campos opcionais ausentes)."""
    prober = DockerProber()

    inspect_resp = httpx.Response(200, json=minimal_inspect_payload)
    stats_resp = httpx.Response(200, json=minimal_stats_payload)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = [inspect_resp, stats_resp]

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "UP"
    assert result.extra_data is not None
    # Valores padrão quando campos ausentes
    assert result.extra_data["cpu_throttled_periods"] == 0
    assert result.extra_data["cpu_throttled_time_ns"] == 0
    assert result.extra_data["memory_page_faults"] == 0
    assert result.extra_data["network_rx_bytes"] == 0
    assert result.extra_data["blkio_read_bytes"] == 0
    assert result.extra_data["pids_current"] == 0
    assert result.extra_data["health_status"] == "none"
    assert result.extra_data["health_output"] is None
    assert result.extra_data["image"] == "postgres:16-alpine"
    assert result.extra_data["container_network"] == {}


@pytest.mark.asyncio
async def test_docker_prober_unhealthy_health(
    docker_target: ProbeTarget,
    healthy_inspect_payload: dict,
    healthy_stats_payload: dict,
) -> None:
    """Testa health status unhealthy."""
    prober = DockerProber()

    unhealthy_payload = healthy_inspect_payload.copy()
    unhealthy_payload["State"]["Health"]["Status"] = "unhealthy"
    unhealthy_payload["State"]["Health"]["FailingStreak"] = 3
    unhealthy_payload["State"]["Health"]["Log"][-1]["Output"] = "FAIL: connection refused"

    inspect_resp = httpx.Response(200, json=unhealthy_payload)
    stats_resp = httpx.Response(200, json=healthy_stats_payload)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = [inspect_resp, stats_resp]

    with patch.object(prober, "_get_client", return_value=mock_client):
        result = await prober.probe(docker_target)

    assert result.status == "UP"  # Health check não afeta status do prober (apenas extra_data)
    assert result.extra_data is not None
    assert result.extra_data["health_status"] == "unhealthy"
    assert result.extra_data["health_failing_streak"] == 3
    assert "connection refused" in result.extra_data["health_output"]


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
    mock_client = _make_async_client_mock(inspect_resp, stats_resp)

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
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

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
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

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
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

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
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

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
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

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
    mock_client = _make_async_client_mock(inspect_resp, stats_resp)

    docker_prober = executor.probers["docker"]
    with patch.object(docker_prober, "_get_client", return_value=mock_client):
        result = await executor.execute(docker_target)

    assert result.status == "UP"


def test_docker_prober_resolves_http_docker_host(docker_target: ProbeTarget) -> None:
    """Verifica se DockerProber configura o cliente apontando para DOCKER_HOST HTTP."""
    prober = DockerProber(docker_host="http://infrawatch-docker-proxy:2375")
    client = prober._get_client(docker_target, timeout_s=2.5)

    assert str(client.base_url) == "http://infrawatch-docker-proxy:2375"
    assert client.timeout.read == 2.5


def test_docker_prober_normalizes_tcp_docker_host(docker_target: ProbeTarget) -> None:
    """Verifica se DockerProber converte tcp:// para http:// em DOCKER_HOST."""
    prober = DockerProber(docker_host="tcp://infrawatch-docker-proxy:2375")
    client = prober._get_client(docker_target, timeout_s=3.0)

    assert str(client.base_url) == "http://infrawatch-docker-proxy:2375"
    assert client.timeout.read == 3.0


def test_docker_prober_reads_env_docker_host(
    monkeypatch: pytest.MonkeyPatch, docker_target: ProbeTarget
) -> None:
    """Valida leitura automática de DOCKER_HOST a partir do ambiente."""
    monkeypatch.setenv("DOCKER_HOST", "http://10.0.0.10:2375")
    prober = DockerProber()
    client = prober._get_client(docker_target, timeout_s=1.0)

    assert str(client.base_url) == "http://10.0.0.10:2375"


def test_docker_prober_fallback_to_unix_socket(
    monkeypatch: pytest.MonkeyPatch, docker_target: ProbeTarget
) -> None:
    """Valida fallback para socket UDS quando DOCKER_HOST não estiver presente."""
    monkeypatch.delenv("DOCKER_HOST", raising=False)
    prober = DockerProber(socket_path="/var/run/custom-docker.sock")
    client = prober._get_client(docker_target, timeout_s=2.0)

    assert str(client.base_url) == "http://docker"
    assert prober.socket_path == "/var/run/custom-docker.sock"


def test_docker_prober_prioritizes_target_ip_and_port() -> None:
    """Verifica que alvo remoto com IP e porta próprios tem precedência sobre DOCKER_HOST."""
    remote_target = ProbeTarget(
        device_id=uuid4(),
        organization_id=uuid4(),
        name="remote-docker-host",
        ip_address="192.168.1.100",
        port=2376,
        protocol="docker",
        category="CONTAINER",
        interval_seconds=30,
    )
    prober = DockerProber(docker_host="http://infrawatch-docker-proxy:2375")
    client = prober._get_client(remote_target, timeout_s=4.0)

    assert str(client.base_url) == "http://192.168.1.100:2376"
