"""Testes unitários para o TokenCleanupWorker e ciclo de manutenção (ADR-024)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workers.daemons.token_cleanup_worker import TokenCleanupWorker


class AsyncContextManager:
    def __init__(self, return_obj=None):
        self.return_obj = return_obj

    async def __aenter__(self):
        return self.return_obj

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.fixture
def mock_redis():
    client = AsyncMock()
    return client


@pytest.fixture
def mock_session_factory():
    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncContextManager(session))

    factory = MagicMock(return_value=AsyncContextManager(session))
    factory.mock_session = session
    return factory


@pytest.fixture
def mock_partition_manager():
    pm = AsyncMock()
    pm.run_maintenance.return_value = {"created": 1, "dropped": 0}
    return pm


@pytest.mark.asyncio
async def test_token_cleanup_worker_run_once_success(
    mock_redis, mock_session_factory, mock_partition_manager
):
    worker = TokenCleanupWorker(
        redis_client=mock_redis,
        session_factory=mock_session_factory,
        partition_manager=mock_partition_manager,
        interval_seconds=3600,
        lock_timeout=300,
        retention_days=7,
    )

    mock_lock = MagicMock()
    mock_lock.acquired = True

    with (
        patch(
            "src.workers.daemons.token_cleanup_worker.redis_distributed_lock",
            return_value=AsyncContextManager(mock_lock),
        ),
        patch.object(worker, "cleanup_expired_tokens", new_callable=AsyncMock) as mock_cleanup,
    ):
        mock_cleanup.return_value = 10
        deleted = await worker.run_once()

        assert deleted == 10
        mock_cleanup.assert_awaited_once()
        mock_partition_manager.run_maintenance.assert_awaited_once()


@pytest.mark.asyncio
async def test_token_cleanup_worker_run_once_lock_not_acquired(
    mock_redis, mock_session_factory, mock_partition_manager
):
    worker = TokenCleanupWorker(
        redis_client=mock_redis,
        session_factory=mock_session_factory,
        partition_manager=mock_partition_manager,
    )

    mock_lock = MagicMock()
    mock_lock.acquired = False

    with (
        patch(
            "src.workers.daemons.token_cleanup_worker.redis_distributed_lock",
            return_value=AsyncContextManager(mock_lock),
        ),
        patch.object(worker, "cleanup_expired_tokens", new_callable=AsyncMock) as mock_cleanup,
    ):
        deleted = await worker.run_once()

        assert deleted is None
        mock_cleanup.assert_not_called()
        mock_partition_manager.run_maintenance.assert_not_called()


@pytest.mark.asyncio
async def test_token_cleanup_worker_resilience_on_partition_maintenance_error(
    mock_redis, mock_session_factory, mock_partition_manager
):
    mock_partition_manager.run_maintenance.side_effect = RuntimeError(
        "Falha no catálogo de partições"
    )

    worker = TokenCleanupWorker(
        redis_client=mock_redis,
        session_factory=mock_session_factory,
        partition_manager=mock_partition_manager,
    )

    mock_lock = MagicMock()
    mock_lock.acquired = True

    with (
        patch(
            "src.workers.daemons.token_cleanup_worker.redis_distributed_lock",
            return_value=AsyncContextManager(mock_lock),
        ),
        patch.object(worker, "cleanup_expired_tokens", new_callable=AsyncMock) as mock_cleanup,
    ):
        mock_cleanup.return_value = 4
        # Não deve levantar exceção, isolando a falha
        deleted = await worker.run_once()

        assert deleted == 4
        mock_cleanup.assert_awaited_once()
        mock_partition_manager.run_maintenance.assert_awaited_once()


@pytest.mark.asyncio
async def test_token_cleanup_worker_start_and_stop_lifecycle(
    mock_redis, mock_session_factory, mock_partition_manager
):
    worker = TokenCleanupWorker(
        redis_client=mock_redis,
        session_factory=mock_session_factory,
        partition_manager=mock_partition_manager,
        interval_seconds=1,
    )

    with patch.object(worker, "run_once", new_callable=AsyncMock) as mock_run_once:
        task = worker.start()
        assert isinstance(task, asyncio.Task)

        # Dá oportunidade ao event loop para iniciar o loop do worker
        await asyncio.sleep(0.01)
        assert worker._running is True

        await worker.stop()
        assert worker._running is False
        assert worker._task is None
        assert mock_run_once.call_count >= 1
