"""Testes do pipeline de execução de sondas, avaliação analítica e telemetria no ProbeWorkerDaemon."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.core.messaging.resilient_bus import InMemoryEventBus, ResilientEventBus
from src.workers.daemons.probe_worker import ProbeWorkerDaemon
from src.workers.probers.base import ProbeResult
from src.workers.probers.executor import ProbeExecutor
from src.workers.scheduler.in_memory_inventory import ProbeTarget


@pytest.fixture
def dummy_session_factory():
    """Mock assíncrono de fábrica de sessões SQLAlchemy."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.close = AsyncMock()

    class SessionContextManager:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    factory = MagicMock(return_value=SessionContextManager())
    factory.mock_session = mock_session
    return factory


@pytest.fixture
def in_memory_event_bus():
    """EventBus resiliente usando InMemoryEventBus como primário para testes."""
    in_memory = InMemoryEventBus()
    return ResilientEventBus(primary_bus=in_memory, fallback_bus=in_memory)


@pytest.fixture
def mock_executor():
    """Mock do ProbeExecutor que retorna resultado saudável por padrão."""
    executor = MagicMock(spec=ProbeExecutor)

    async def _default_probe(target: ProbeTarget, timeout_ms: int = 2000) -> ProbeResult:
        return ProbeResult(
            device_id=target.device_id,
            target_name=target.name,
            status="UP",
            latency_ms=12.0,
            packet_loss_pct=0.0,
        )

    executor.execute = AsyncMock(side_effect=_default_probe)
    return executor


@pytest.fixture
def mock_batch_writer():
    """Mock do MetricsBatchWriter."""
    writer = MagicMock()
    writer._flush_interval = 5.0
    writer.enqueue = MagicMock()
    writer.flush = AsyncMock(return_value=2)
    return writer


@pytest.fixture
def worker(dummy_session_factory, in_memory_event_bus, mock_executor, mock_batch_writer):
    """Instância configurada do ProbeWorkerDaemon com dependências mockadas."""
    daemon = ProbeWorkerDaemon(
        event_bus=in_memory_event_bus,
        session_factory=dummy_session_factory,
        reconciliation_interval_seconds=300,
        executor=mock_executor,
        batch_writer=mock_batch_writer,
    )
    return daemon


@pytest.fixture
def sample_target():
    """Alvo de sondagem de exemplo."""
    return ProbeTarget(
        device_id=uuid4(),
        organization_id=uuid4(),
        name="Switch-Core-01",
        ip_address="192.168.1.1",
        port=0,
        protocol="icmp",
        category="network",
        interval_seconds=10,
        is_paused=False,
        status="UP",
    )


class TestProbeWorkerPipeline:
    @pytest.mark.asyncio
    async def test_schedule_tick_dispatches_due_target(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock, mock_batch_writer: MagicMock
    ) -> None:
        """Sonda é executada e telemetria é bufferizada para alvo apto."""
        await worker.schedule.add_or_update(sample_target)

        await worker._schedule_tick()

        mock_executor.execute.assert_called_once_with(sample_target, timeout_ms=worker.probe_timeout_ms)
        mock_batch_writer.enqueue.assert_called_once()
        assert sample_target.device_id in worker._last_probed

    @pytest.mark.asyncio
    async def test_schedule_tick_skips_paused_target(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock
    ) -> None:
        """Alvos pausados são ignorados pelo agendador."""
        sample_target.is_paused = True
        sample_target.status = "PAUSED"
        await worker.schedule.add_or_update(sample_target)

        await worker._schedule_tick()

        mock_executor.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_schedule_tick_respects_interval(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock
    ) -> None:
        """Alvo sondado recentemente não é executado novamente antes de interval_seconds."""
        await worker.schedule.add_or_update(sample_target)

        # Primeiro tick executa
        await worker._schedule_tick()
        assert mock_executor.execute.call_count == 1

        # Segundo tick imediato deve pular o alvo
        await worker._schedule_tick()
        assert mock_executor.execute.call_count == 1

    @pytest.mark.asyncio
    async def test_three_consecutive_failures_transitions_to_down_and_emits_event(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock, dummy_session_factory: MagicMock
    ) -> None:
        """3 falhas consecutivas colocam ativo em DOWN, gravam no Outbox e no Redis Stream."""
        mock_executor.execute = AsyncMock(
            return_value=ProbeResult(
                device_id=sample_target.device_id,
                target_name=sample_target.name,
                status="DOWN",
                latency_ms=0.0,
                packet_loss_pct=100.0,
                error_message="Host unreachable",
            )
        )
        await worker.schedule.add_or_update(sample_target)

        # Executa 3 ciclos de sonda para atingir retry_threshold=3
        for _ in range(3):
            # Força tempo para permitir execução
            worker._last_probed[sample_target.device_id] = 0.0
            await worker._schedule_tick()

        # Status deve ter atualizado em memória
        target_in_schedule = await worker.schedule.get(sample_target.device_id)
        assert target_in_schedule is not None
        assert target_in_schedule.status == "DOWN"

        # Outbox deve ter gravado o evento
        mock_session = dummy_session_factory.mock_session
        assert mock_session.add.called
        assert mock_session.commit.called

    @pytest.mark.asyncio
    async def test_degradation_transitions_to_degraded(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock
    ) -> None:
        """Pico de latência transiciona ativo para DEGRADED."""
        # Baseline inicial saudável de 10ms
        evaluator = worker.get_evaluator(sample_target.device_id)
        evaluator.add_latency_sample(10.0)

        # Proba com pico de 150ms (> 2x baseline)
        mock_executor.execute = AsyncMock(
            return_value=ProbeResult(
                device_id=sample_target.device_id,
                target_name=sample_target.name,
                status="UP",
                latency_ms=150.0,
                packet_loss_pct=0.0,
            )
        )
        await worker.schedule.add_or_update(sample_target)

        await worker._schedule_tick()

        target_in_schedule = await worker.schedule.get(sample_target.device_id)
        assert target_in_schedule is not None
        assert target_in_schedule.status == "DEGRADED"

    @pytest.mark.asyncio
    async def test_recovery_from_down_to_up(
        self, worker: ProbeWorkerDaemon, sample_target: ProbeTarget, mock_executor: MagicMock
    ) -> None:
        """Ativo em DOWN recupera para UP após 2 probes saudáveis consecutivos."""
        evaluator = worker.get_evaluator(sample_target.device_id)
        evaluator.current_status = evaluator._state_machine._coerce_status("DOWN")
        sample_target.status = "DOWN"
        await worker.schedule.add_or_update(sample_target)

        # Probe 1 saudável: continua DOWN (1/2 para recuperação)
        worker._last_probed[sample_target.device_id] = 0.0
        await worker._schedule_tick()
        target = await worker.schedule.get(sample_target.device_id)
        assert target is not None
        assert target.status == "DOWN"

        # Probe 2 saudável: recupera para UP (2/2)
        worker._last_probed[sample_target.device_id] = 0.0
        await worker._schedule_tick()
        target = await worker.schedule.get(sample_target.device_id)
        assert target is not None
        assert target.status == "UP"

    @pytest.mark.asyncio
    async def test_stop_signals_graceful_shutdown(
        self, worker: ProbeWorkerDaemon, mock_batch_writer: MagicMock
    ) -> None:
        """stop() ativa o _stop_event e desliga o worker graciosamente."""
        assert not worker._stop_event.is_set()
        worker.stop()
        assert worker._stop_event.is_set()
