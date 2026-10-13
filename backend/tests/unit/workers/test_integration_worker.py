from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workers.daemons.integration_worker import IntegrationWorker


@pytest.mark.asyncio
async def test_integration_worker_glpi_disabled_by_default() -> None:
    mock_event_bus = MagicMock()
    mock_event_bus.close = AsyncMock()

    with patch("src.workers.daemons.integration_worker.get_settings") as mock_settings:
        mock_settings.return_value.GLPI_ENABLED = False
        mock_settings.return_value.GLPI_APP_TOKEN = ""
        mock_settings.return_value.GLPI_USER_TOKEN = ""

        worker = IntegrationWorker(event_bus=mock_event_bus)

        assert worker.is_glpi_enabled is False
        assert worker._glpi_consumer is None
        assert worker._notification_consumer is not None


@pytest.mark.asyncio
async def test_integration_worker_glpi_enabled_when_configured() -> None:
    mock_event_bus = MagicMock()
    mock_event_bus.close = AsyncMock()

    with patch("src.workers.daemons.integration_worker.get_settings") as mock_settings:
        mock_settings.return_value.GLPI_ENABLED = True
        mock_settings.return_value.GLPI_APP_TOKEN = "test-app-token"
        mock_settings.return_value.GLPI_USER_TOKEN = "test-user-token"
        mock_settings.return_value.GLPI_BASE_URL = "http://localhost:8080/apirest.php"

        worker = IntegrationWorker(event_bus=mock_event_bus)

        assert worker.is_glpi_enabled is True
        assert worker._glpi_consumer is not None


@pytest.mark.asyncio
async def test_integration_worker_run_and_graceful_stop() -> None:
    mock_event_bus = MagicMock()
    mock_event_bus.close = AsyncMock()

    mock_notif_consumer = MagicMock()
    mock_glpi_consumer = MagicMock()
    mock_email_consumer = MagicMock()

    async def fake_notif_loop(stop_event):
        await stop_event.wait()

    async def fake_glpi_loop(stop_event):
        await stop_event.wait()

    async def fake_email_loop(stop_event):
        await stop_event.wait()

    mock_notif_consumer.consume_loop = AsyncMock(side_effect=fake_notif_loop)
    mock_glpi_consumer.consume_loop = AsyncMock(side_effect=fake_glpi_loop)
    mock_email_consumer.consume_loop = AsyncMock(side_effect=fake_email_loop)

    worker = IntegrationWorker(
        event_bus=mock_event_bus,
        notification_consumer=mock_notif_consumer,
        glpi_consumer=mock_glpi_consumer,
        email_consumer=mock_email_consumer,
    )

    import asyncio

    task = asyncio.create_task(worker.run())
    await asyncio.sleep(0.05)

    assert not task.done()
    assert not worker._stop_event.is_set()

    worker.stop()
    await task

    mock_notif_consumer.consume_loop.assert_awaited_once_with(worker._stop_event)
    mock_glpi_consumer.consume_loop.assert_awaited_once_with(worker._stop_event)
    mock_email_consumer.consume_loop.assert_awaited_once_with(worker._stop_event)
    mock_event_bus.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_integration_worker_handles_cancellation() -> None:
    mock_event_bus = MagicMock()
    mock_event_bus.close = AsyncMock()

    mock_notif_consumer = MagicMock()
    mock_email_consumer = MagicMock()

    async def infinite_loop(stop_event):
        while not stop_event.is_set():
            await asyncio.sleep(1.0)

    mock_notif_consumer.consume_loop = AsyncMock(side_effect=infinite_loop)
    mock_email_consumer.consume_loop = AsyncMock(side_effect=infinite_loop)

    worker = IntegrationWorker(
        event_bus=mock_event_bus,
        notification_consumer=mock_notif_consumer,
        email_consumer=mock_email_consumer,
    )

    import asyncio

    task = asyncio.create_task(worker.run())
    await asyncio.sleep(0.05)

    task.cancel()
    await task

    mock_event_bus.close.assert_awaited_once()
