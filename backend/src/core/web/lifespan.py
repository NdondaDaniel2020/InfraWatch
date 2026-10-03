import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from fastapi import FastAPI

from src.core.config import get_settings
from src.core.database.session import get_engine, get_session_factory
from src.core.messaging.resilient_bus import ResilientEventBus
from src.core.messaging.sse_broadcaster import get_sse_broadcaster
from src.core.observability.logging import setup_logging
from workers.daemons.outbox_relay_worker import OutboxRelayWorker
from workers.daemons.token_cleanup_worker import TokenCleanupWorker

logger = logging.getLogger("infrawatch.lifespan")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gerencia inicialização e encerramento gracioso de recursos e conexões assíncronas."""
    # 1. Startup: inicializa logging estruturado e configurações
    setup_logging()
    settings = get_settings()
    logger.info(
        "Iniciando %s v%s no ambiente '%s' (DEBUG=%s)",
        getattr(settings, "PROJECT_NAME", "InfraWatch"),
        "0.1.0",
        settings.ENVIRONMENT,
        settings.DEBUG,
    )

    engine = get_engine()
    event_bus = ResilientEventBus()
    app.state.event_bus = event_bus

    outbox_task: asyncio.Task[None] | None = None
    outbox_stop_event: asyncio.Event | None = None
    token_cleanup_worker: TokenCleanupWorker | None = None
    redis_client: aioredis.Redis | None = None

    if settings.ENABLE_BACKGROUND_WORKERS and settings.ENVIRONMENT != "test":
        logger.info("Inicializando workers de segundo plano (OutboxRelay & TokenCleanup)...")
        try:
            redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            app.state.redis_client = redis_client

            # Configura publicador integrado do Outbox (despacha para EventBus e repassa para SSE)
            async def outbox_dispatcher(event_type: str, payload: dict[str, Any]) -> None:
                await event_bus.publish(event_type, payload)
                target_user = payload.get("user_id") or payload.get("target_user_id")
                if target_user:
                    try:
                        broadcaster = get_sse_broadcaster()
                        await broadcaster.broadcast_to_user(str(target_user), event_type, payload)
                    except Exception:
                        logger.warning(
                            "Falha ao encaminhar evento do Outbox para SSE", exc_info=True
                        )

            outbox_stop_event = asyncio.Event()
            outbox_worker = OutboxRelayWorker(
                publisher=outbox_dispatcher,
                session_factory=get_session_factory(),
                batch_size=settings.OUTBOX_RELAY_BATCH_SIZE,
            )
            outbox_task = asyncio.create_task(
                outbox_worker.run_forever(
                    poll_interval=settings.OUTBOX_RELAY_POLL_INTERVAL_SECONDS,
                    stop_event=outbox_stop_event,
                )
            )

            token_cleanup_worker = TokenCleanupWorker(
                redis_client=redis_client,
                session_factory=get_session_factory(),
                interval_seconds=settings.TOKEN_CLEANUP_INTERVAL_SECONDS,
                lock_timeout=settings.TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS,
                retention_days=settings.TOKEN_CLEANUP_RETENTION_DAYS,
            )
            token_cleanup_worker.start()

            app.state.outbox_task = outbox_task
            app.state.outbox_stop_event = outbox_stop_event
            app.state.token_cleanup_worker = token_cleanup_worker
            logger.info("Workers de segundo plano iniciados com sucesso.")
        except Exception:
            logger.exception("Falha ao inicializar workers de segundo plano no startup")

    try:
        yield
    finally:
        # 2. Teardown gracioso: encerra workers, conexões e pools
        logger.info("Encerrando workers e conexões em segundo plano...")
        if outbox_stop_event is not None:
            outbox_stop_event.set()
        if outbox_task is not None and not outbox_task.done():
            outbox_task.cancel()
            try:
                await asyncio.wait_for(outbox_task, timeout=2.0)
            except (TimeoutError, asyncio.CancelledError):
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("Exceção ao encerrar OutboxRelayWorker task: %s", exc)

        if token_cleanup_worker is not None:
            try:
                await token_cleanup_worker.stop()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Exceção ao encerrar TokenCleanupWorker: %s", exc)

        if redis_client is not None:
            try:
                await redis_client.aclose()
            except Exception as exc:  # noqa: BLE001
                logger.debug("Falha ao encerrar conexão Redis no teardown: %s", exc)

        try:
            await event_bus.close()
        except Exception as exc:  # noqa: BLE001
            logger.debug("Falha ao encerrar event_bus no teardown: %s", exc)

        await engine.dispose()
        logger.info("Encerramento do ciclo de vida concluído com sucesso.")
