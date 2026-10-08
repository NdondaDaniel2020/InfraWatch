"""Testes unitários para o ciclo de vida da aplicação (lifespan) e agendamento dos workers."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI

from src.core.config import Settings
from src.core.web.lifespan import lifespan


@pytest.mark.asyncio
async def test_lifespan_starts_and_stops_workers_in_development():
    """Valida que o lifespan instancia, inicia e encerra graciosamente os workers em ambientes não-test."""
    app = FastAPI()

    custom_settings = Settings(
        ENVIRONMENT="development",
        ENABLE_BACKGROUND_WORKERS=True,
        OUTBOX_RELAY_POLL_INTERVAL_SECONDS=1.0,
        TOKEN_CLEANUP_INTERVAL_SECONDS=3600,
    )

    fake_redis = AsyncMock()
    fake_redis.aclose = AsyncMock()
    mock_engine = AsyncMock()
    mock_engine.dispose = AsyncMock()

    mock_outbox_worker = MagicMock()

    async def fake_outbox_run_forever(
        poll_interval: float = 1.0, stop_event: asyncio.Event | None = None
    ) -> None:
        try:
            if stop_event:
                await stop_event.wait()
        except asyncio.CancelledError:
            pass

    mock_outbox_worker.run_forever = fake_outbox_run_forever

    mock_cleanup_worker = MagicMock()
    mock_cleanup_worker.start = MagicMock(return_value=asyncio.create_task(asyncio.sleep(100)))
    mock_cleanup_worker.stop = AsyncMock()

    with (
        patch("src.core.web.lifespan.get_settings", return_value=custom_settings),
        patch("src.core.web.lifespan.init_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.close_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.init_db", new_callable=AsyncMock, return_value=mock_engine),
        patch("src.core.web.lifespan.close_db", new_callable=AsyncMock),
        patch("src.core.web.lifespan.OutboxRelayWorker", return_value=mock_outbox_worker),
        patch("src.core.web.lifespan.TokenCleanupWorker", return_value=mock_cleanup_worker),
    ):
        async with lifespan(app):
            # Valida registro de instâncias e tasks no app.state
            assert hasattr(app.state, "event_bus")
            assert hasattr(app.state, "outbox_task")
            assert app.state.outbox_task is not None
            assert not app.state.outbox_task.done()
            assert hasattr(app.state, "token_cleanup_worker")
            assert app.state.token_cleanup_worker is mock_cleanup_worker
            mock_cleanup_worker.start.assert_called_once()

        # Valida teardown gracioso
        assert app.state.outbox_stop_event.is_set()
        assert app.state.outbox_task.done()
        mock_cleanup_worker.stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_lifespan_skips_workers_when_environment_is_test():
    """Valida que em ENVIRONMENT=test os workers de background não são iniciados automaticamente."""
    app = FastAPI()

    test_settings = Settings(
        ENVIRONMENT="test",
        ENABLE_BACKGROUND_WORKERS=True,
    )
    mock_engine = AsyncMock()

    with (
        patch("src.core.web.lifespan.get_settings", return_value=test_settings),
        patch("src.core.web.lifespan.init_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.close_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.init_db", new_callable=AsyncMock, return_value=mock_engine),
        patch("src.core.web.lifespan.close_db", new_callable=AsyncMock),
    ):
        async with lifespan(app):
            assert hasattr(app.state, "event_bus")
            assert not hasattr(app.state, "outbox_task")
            assert not hasattr(app.state, "token_cleanup_worker")


@pytest.mark.asyncio
async def test_outbox_dispatcher_relays_to_sse_when_target_user_present():
    """Valida que o callback outbox_dispatcher encaminha mensagens direcionadas a usuário para o SSE."""
    app = FastAPI()
    custom_settings = Settings(
        ENVIRONMENT="development",
        ENABLE_BACKGROUND_WORKERS=True,
    )

    fake_broadcaster = AsyncMock()
    mock_cleanup_worker = MagicMock()
    mock_cleanup_worker.start = MagicMock()
    mock_cleanup_worker.stop = AsyncMock()

    with (
        patch("src.core.web.lifespan.get_settings", return_value=custom_settings),
        patch("src.core.web.lifespan.init_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.close_redis", new_callable=AsyncMock),
        patch("src.core.web.lifespan.init_db", new_callable=AsyncMock),
        patch("src.core.web.lifespan.close_db", new_callable=AsyncMock),
        patch("src.core.web.lifespan.get_sse_broadcaster", return_value=fake_broadcaster),
        patch("src.core.web.lifespan.OutboxRelayWorker") as mock_outbox_cls,
        patch("src.core.web.lifespan.TokenCleanupWorker", return_value=mock_cleanup_worker),
    ):
        mock_outbox_worker = MagicMock()
        mock_outbox_worker.run_forever = AsyncMock()
        mock_outbox_cls.return_value = mock_outbox_worker

        async with lifespan(app):
            assert mock_outbox_cls.called
            publisher_callback = mock_outbox_cls.call_args[1]["publisher"]

            payload = {"user_id": "usr-1234", "message": "Conta confirmada"}
            await publisher_callback("UserVerified", payload)

            fake_broadcaster.broadcast_to_user.assert_awaited_once_with(
                "usr-1234", "UserVerified", payload
            )


@pytest.mark.asyncio
async def test_outbox_relay_worker_standalone_entrypoint():
    """Valida que run_standalone no OutboxRelayWorker inicia e finaliza os recursos."""
    from src.workers.daemons.outbox_relay_worker import run_standalone

    with (
        patch(
            "src.workers.daemons.outbox_relay_worker.OutboxRelayWorker.run_forever", new_callable=AsyncMock
        ) as mock_run,
        patch(
            "src.workers.daemons.outbox_relay_worker.ResilientEventBus.close", new_callable=AsyncMock
        ) as mock_close,
        patch("src.workers.daemons.outbox_relay_worker.get_session_factory") as mock_session_factory,
    ):
        mock_session_factory.return_value = MagicMock()
        await run_standalone()
        mock_run.assert_awaited_once()
        mock_close.assert_awaited_once()


@pytest.mark.asyncio
async def test_token_cleanup_worker_standalone_entrypoint():
    """Valida que run_standalone no TokenCleanupWorker inicia e finaliza a conexão Redis."""
    from src.workers.daemons.token_cleanup_worker import run_standalone

    fake_redis = AsyncMock()
    fake_redis.aclose = AsyncMock()

    with (
        patch("src.workers.daemons.token_cleanup_worker.aioredis.from_url", return_value=fake_redis),
        patch(
            "src.workers.daemons.token_cleanup_worker.TokenCleanupWorker.run_forever",
            new_callable=AsyncMock,
        ) as mock_run,
        patch("src.workers.daemons.token_cleanup_worker.get_session_factory") as mock_session_factory,
    ):
        mock_session_factory.return_value = MagicMock()
        await run_standalone()
        mock_run.assert_awaited_once()
        fake_redis.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_outbox_relay_polling_fallback_when_listener_fails():
    """Valida que o OutboxRelayWorker acorda via timeout de polling quando o listener falha ou não há NOTIFY."""
    from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker

    mock_publisher = AsyncMock()
    mock_session_factory = MagicMock()
    worker = OutboxRelayWorker(
        publisher=mock_publisher,
        session_factory=mock_session_factory,
    )

    stop_event = asyncio.Event()
    batch_counter = 0

    async def fake_process_batch():
        nonlocal batch_counter
        batch_counter += 1
        if batch_counter >= 2:
            stop_event.set()
        return 0

    worker.process_batch = fake_process_batch

    # Simula listener inoperante / em loop de erro
    with patch.object(worker, "_listen_for_notifications", AsyncMock()):
        # poll_interval curto (0.05s) para o fallback de timeout disparar rapidamente
        await worker.run_forever(poll_interval=0.05, stop_event=stop_event)

    assert batch_counter >= 2
    assert not worker.is_listener_healthy


@pytest.mark.asyncio
async def test_outbox_relay_fast_path_via_wake_signal():
    """Valida que quando wake_signal é disparado (via NOTIFY), o loop acorda sem esperar o timeout."""
    from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker

    mock_publisher = AsyncMock()
    mock_session_factory = MagicMock()
    worker = OutboxRelayWorker(
        publisher=mock_publisher,
        session_factory=mock_session_factory,
    )

    stop_event = asyncio.Event()
    batch_calls = 0

    async def fake_process_batch():
        nonlocal batch_calls
        batch_calls += 1
        if batch_calls == 1:
            # Primeiro ciclo: nada pendente, vai dormir no wait_for
            return 0
        # Segundo ciclo (acordado pelo wake_signal): encerra o loop
        stop_event.set()
        return 0

    worker.process_batch = fake_process_batch

    async def trigger_notify_soon():
        # Envia sinal repetidamente para garantir que acorde o wait_for imediatamente
        for _ in range(5):
            await asyncio.sleep(0.02)
            worker.wake_signal.set()
            if stop_event.is_set():
                break

    task = asyncio.create_task(trigger_notify_soon())

    with patch.object(worker, "_listen_for_notifications", AsyncMock()):
        start_time = asyncio.get_event_loop().time()
        # Fallback timeout configurado como 5s; se o wake_signal funcionar, sai em <0.5s
        await worker.run_forever(poll_interval=5.0, stop_event=stop_event)
        elapsed = asyncio.get_event_loop().time() - start_time

    await task
    assert batch_calls >= 2
    assert elapsed < 2.0
