"""Testes aprofundados para ProbeWorkerDaemon (loops, on-demand, reconciliação e ciclo de vida)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.core.messaging.resilient_bus import InMemoryEventBus, ResilientEventBus
from src.workers.daemons.probe_worker import ProbeWorkerDaemon, run_standalone
from src.workers.probers.base import ProbeResult
from src.workers.probers.ondemand_command import OnDemandProbeCommand


@pytest.fixture
def mock_session_factory():
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()

    class SessionContext:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    factory = MagicMock(return_value=SessionContext())
    factory.mock_session = mock_session
    return factory


@pytest.fixture
def resilient_event_bus():
    bus = InMemoryEventBus()
    return ResilientEventBus(primary_bus=bus, fallback_bus=bus)


@pytest.mark.asyncio
async def test_fetch_devices_from_db_and_reconciliation(
    mock_session_factory, resilient_event_bus
) -> None:
    """Valida busca de dispositivos do banco e loop de reconciliação."""
    mock_model = MagicMock()
    mock_model.id = uuid4()
    mock_model.organization_id = uuid4()
    mock_model.name = "Switch Core"
    mock_model.ip_address = "10.0.0.1"
    mock_model.port = 22
    mock_model.protocol = "ssh"
    mock_model.category = "switch"
    mock_model.interval_seconds = 30
    mock_model.status = "ONLINE"
    mock_model.is_paused = False
    mock_model.is_in_maintenance = False
    mock_model.maintenance_until = None
    mock_model.thresholds = None

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [mock_model]
    mock_session_factory.mock_session.execute.return_value = result_mock

    worker = ProbeWorkerDaemon(
        event_bus=resilient_event_bus,
        session_factory=mock_session_factory,
        reconciliation_interval_seconds=1,
    )

    targets = await worker.fetch_devices_from_db()
    assert len(targets) == 1
    assert targets[0].device_id == mock_model.id

    # Testar reconciliação rápida (cancelada com stop_event)
    worker.stop()
    await worker._reconciliation_loop()


@pytest.mark.asyncio
async def test_execute_ondemand_probe(mock_session_factory, resilient_event_bus) -> None:
    """Valida execução de sonda on-demand e transmissão via broadcaster SSE."""
    worker = ProbeWorkerDaemon(
        event_bus=resilient_event_bus,
        session_factory=mock_session_factory,
    )

    cmd = OnDemandProbeCommand(
        probe_id="prb-123",
        node_id=str(uuid4()),
        ip_address="8.8.8.8",
        timeout_ms=1000,
        organization_id=str(uuid4()),
    )

    mock_probe_result = ProbeResult(
        device_id=uuid4(),
        target_name="on-demand:node",
        status="UP",
        latency_ms=15.5,
        packet_loss_pct=0.0,
    )

    with (
        patch(
            "src.workers.daemons.probe_worker.IcmpProber.probe", new_callable=AsyncMock
        ) as mock_probe,
        patch("src.workers.daemons.probe_worker.get_sse_broadcaster") as mock_broadcaster_factory,
    ):
        mock_probe.return_value = mock_probe_result
        mock_broadcaster = AsyncMock()
        mock_broadcaster_factory.return_value = mock_broadcaster

        await worker._execute_ondemand_probe(cmd)

        mock_probe.assert_awaited_once()
        mock_broadcaster.broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_ondemand_probe_loop_consumption(mock_session_factory) -> None:
    """Valida consumo do Redis Stream no _ondemand_probe_loop com ACK."""
    mock_bus = AsyncMock()
    cmd_dict = {
        "probe_id": "p-1",
        "node_id": str(uuid4()),
        "ip_address": "1.1.1.1",
        "timeout_ms": 1000,
    }
    # 1ª iteração retorna mensagem; 2ª iteração finaliza
    mock_bus.consume_batch.side_effect = [
        [("msg-id-1", cmd_dict)],
        [],
    ]

    worker = ProbeWorkerDaemon(
        event_bus=mock_bus,
        session_factory=mock_session_factory,
    )

    with patch.object(worker, "_execute_ondemand_probe", new_callable=AsyncMock):
        # Roda um ciclo e desliga
        async def stop_after_delay():
            await asyncio.sleep(0.05)
            worker.stop()

        asyncio.create_task(stop_after_delay())
        await worker._ondemand_probe_loop()

        mock_bus.ack.assert_awaited()


@pytest.mark.asyncio
async def test_probe_worker_run_and_shutdown(mock_session_factory, resilient_event_bus) -> None:
    """Valida inicialização e desligamento gracioso de todas as tarefas de background."""
    worker = ProbeWorkerDaemon(
        event_bus=resilient_event_bus,
        session_factory=mock_session_factory,
    )

    with (
        patch.object(worker, "fetch_devices_from_db", new_callable=AsyncMock, return_value=[]),
        patch.object(worker.consumer, "consume_loop", new_callable=AsyncMock),
        patch.object(worker, "_reconciliation_loop", new_callable=AsyncMock),
        patch.object(worker, "_scheduler_loop", new_callable=AsyncMock),
        patch.object(worker, "_telemetry_flush_loop", new_callable=AsyncMock),
        patch.object(worker, "_ondemand_probe_loop", new_callable=AsyncMock),
    ):

        async def stop_worker():
            await asyncio.sleep(0.05)
            worker.stop()

        asyncio.create_task(stop_worker())
        await worker.run()

        assert worker._stop_event.is_set()


@pytest.mark.asyncio
async def test_run_standalone_graceful_exit() -> None:
    """Valida ponto de entrada CLI run_standalone."""
    with (
        patch("src.workers.daemons.probe_worker.ResilientEventBus") as mock_bus_cls,
        patch("src.workers.daemons.probe_worker.get_session_factory"),
        patch("src.workers.daemons.probe_worker.ProbeWorkerDaemon") as mock_daemon_cls,
    ):
        mock_bus = AsyncMock()
        mock_bus_cls.return_value = mock_bus
        mock_daemon = AsyncMock()
        mock_daemon.stop = MagicMock()
        mock_daemon_cls.return_value = mock_daemon

        await run_standalone()
        mock_daemon.run.assert_awaited_once()
        mock_bus.close.assert_awaited_once()
