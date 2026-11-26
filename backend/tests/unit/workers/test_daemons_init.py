"""Testes unitários para o módulo workers.daemons (__init__)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import src.workers.daemons as daemons_mod
from src.workers.daemons import (
    close_workers,
    get_outbox_relay_worker,
    get_token_cleanup_worker,
)


@pytest.mark.asyncio
async def test_daemons_init_get_outbox_worker_and_dispatcher() -> None:
    """Valida fábrica do OutboxRelayWorker e seu dispatcher interno com SSE."""
    # Reset singleton state
    daemons_mod._outbox_worker = None

    mock_event_bus = AsyncMock()
    mock_sse = AsyncMock()
    mock_session_factory = MagicMock()

    worker = get_outbox_relay_worker(
        event_bus=mock_event_bus,
        sse_broadcaster=mock_sse,
        session_factory=mock_session_factory,
        batch_size=20,
        worker_id="test-worker",
    )
    assert worker is not None
    assert daemons_mod._outbox_worker is worker

    # Invoca dispatcher interno
    dispatcher = worker.publisher
    # 1. Com user_id no payload
    await dispatcher(
        "incident:created", {"event_type": "incident:created", "user_id": "u123", "data": "abc"}
    )
    mock_event_bus.publish.assert_called_with(
        "incident:created", {"event_type": "incident:created", "user_id": "u123", "data": "abc"}
    )
    mock_sse.broadcast_to_user.assert_called_with(
        "u123",
        "incident:created",
        {"event_type": "incident:created", "user_id": "u123", "data": "abc"},
    )

    # 2. Com falha no SSE
    mock_sse.broadcast_to_user.side_effect = RuntimeError("SSE broken")
    await dispatcher("stream_x", {"target_user_id": "u456"})


@pytest.mark.asyncio
async def test_daemons_init_get_token_cleanup_worker_and_close() -> None:
    """Valida fábrica do TokenCleanupWorker e encerramento com close_workers."""
    daemons_mod._token_cleanup_worker = None

    mock_redis = AsyncMock()
    mock_session_factory = MagicMock()

    cleanup = get_token_cleanup_worker(
        redis_client=mock_redis,
        session_factory=mock_session_factory,
    )
    assert cleanup is not None

    # Chamada idempotente retorna a mesma instância
    assert get_token_cleanup_worker() is cleanup

    # Close workers
    with patch.object(cleanup, "stop", new_callable=AsyncMock) as mock_stop:
        await close_workers()
        mock_stop.assert_called_once()
    assert daemons_mod._token_cleanup_worker is None
    assert daemons_mod._outbox_worker is None


def test_daemons_init_getattr_dynamic_imports() -> None:
    """Valida __getattr__ dinâmico para importações de daemons."""
    from src.workers.daemons import (
        EventPublisher,
        IntegrationWorker,
        OutboxRelayWorker,
        PublishCallback,
        TokenCleanupWorker,
        ZabbixSyncWorker,
        run_cleanup_standalone,
        run_outbox_standalone,
    )

    assert EventPublisher is not None
    assert IntegrationWorker is not None
    assert OutboxRelayWorker is not None
    assert PublishCallback is not None
    assert TokenCleanupWorker is not None
    assert ZabbixSyncWorker is not None
    assert callable(run_cleanup_standalone)
    assert callable(run_outbox_standalone)

    with pytest.raises(AttributeError, match="has no attribute 'UnknownWorker'"):
        _ = daemons_mod.UnknownWorker
