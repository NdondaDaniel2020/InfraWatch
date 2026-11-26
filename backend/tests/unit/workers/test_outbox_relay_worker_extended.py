"""Testes unitários adicionais para OutboxRelayWorker (backoff, poison messages e batch processing)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.core.messaging.exceptions import PoisonMessageError
from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker


@pytest.fixture
def mock_session_factory():
    mock_session = AsyncMock()
    mock_session.begin = MagicMock()
    mock_session.begin.return_value.__aenter__ = AsyncMock()
    mock_session.begin.return_value.__aexit__ = AsyncMock()

    class SessionContext:
        async def __aenter__(self):
            return mock_session

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    factory = MagicMock(return_value=SessionContext())
    factory.mock_session = mock_session
    return factory


@pytest.mark.asyncio
async def test_process_batch_success(mock_session_factory) -> None:
    """Valida processamento de lote com despacho de sucesso e marcação como publicado."""
    mock_publisher = AsyncMock()
    worker = OutboxRelayWorker(publisher=mock_publisher, session_factory=mock_session_factory)

    mock_event = MagicMock()
    mock_event.id = uuid4()
    mock_event.event_type = "DeviceCreated"
    mock_event.payload = {"device_id": str(uuid4())}
    mock_event.retry_count = 0

    with (
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.fetch_pending_events",
            new_callable=AsyncMock,
        ) as mock_fetch,
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.mark_as_published",
            new_callable=AsyncMock,
        ) as mock_pub,
    ):
        mock_fetch.return_value = [mock_event]

        count = await worker.process_batch()
        assert count == 1
        mock_publisher.publish.assert_awaited_once()
        mock_pub.assert_awaited_once_with(mock_session_factory.mock_session, mock_event.id)


@pytest.mark.asyncio
async def test_process_batch_poison_message(mock_session_factory) -> None:
    """Valida detecção de mensagem venenosa (PoisonMessageError) marcando como FAILED de imediato."""
    mock_publisher = AsyncMock()
    mock_publisher.publish.side_effect = PoisonMessageError("Invalid structure")

    worker = OutboxRelayWorker(publisher=mock_publisher, session_factory=mock_session_factory)

    mock_event = MagicMock()
    mock_event.id = uuid4()
    mock_event.event_type = "CorruptEvent"
    mock_event.payload = {}
    mock_event.retry_count = 0

    with (
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.fetch_pending_events",
            new_callable=AsyncMock,
        ) as mock_fetch,
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.mark_as_failed",
            new_callable=AsyncMock,
        ) as mock_failed,
    ):
        mock_fetch.return_value = [mock_event]

        count = await worker.process_batch()
        assert count == 0
        mock_failed.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_batch_transient_error(mock_session_factory) -> None:
    """Valida erro transitório incrementando tentativas via OutboxRepository.mark_as_failed."""
    mock_publisher = AsyncMock()
    mock_publisher.publish.side_effect = RuntimeError("Temporary network timeout")

    worker = OutboxRelayWorker(publisher=mock_publisher, session_factory=mock_session_factory)

    mock_event = MagicMock()
    mock_event.id = uuid4()
    mock_event.event_type = "DeviceStatusUpdated"
    mock_event.payload = {}
    mock_event.retry_count = 1

    with (
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.fetch_pending_events",
            new_callable=AsyncMock,
        ) as mock_fetch,
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRepository.mark_as_failed",
            new_callable=AsyncMock,
        ) as mock_failed,
    ):
        mock_fetch.return_value = [mock_event]

        count = await worker.process_batch()
        assert count == 0
        mock_failed.assert_awaited_once_with(
            session=mock_session_factory.mock_session,
            event_id=mock_event.id,
            error="Temporary network timeout",
            max_retries=worker.max_retries,
            base_delay=worker.base_delay,
            max_delay=worker.max_delay,
        )


@pytest.mark.asyncio
async def test_run_forever_graceful_stop(mock_session_factory) -> None:
    """Valida que run_forever respeita stop_event de forma graciosa."""
    worker = OutboxRelayWorker(publisher=AsyncMock(), session_factory=mock_session_factory)
    stop_event = asyncio.Event()

    with (
        patch.object(worker, "_listen_for_notifications", new_callable=AsyncMock),
        patch.object(worker, "process_batch", new_callable=AsyncMock, return_value=0),
    ):
        # Sinaliza parada quase que imediata
        async def stop_later():
            await asyncio.sleep(0.05)
            stop_event.set()

        asyncio.create_task(stop_later())
        await worker.run_forever(poll_interval=0.1, stop_event=stop_event)
        assert stop_event.is_set()
