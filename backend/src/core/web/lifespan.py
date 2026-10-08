"""Application lifespan management for InfraWatch.

Handles startup/shutdown of database, Redis, event bus, and background workers.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from datetime import datetime, UTC

from src.core.config import get_settings
from src.core.database.init_db import close_db, init_db
from src.core.database.session import get_session_factory
from src.core.infrastructure.redis import close_redis, get_redis_client, init_redis
from src.core.messaging.resilient_bus import ResilientEventBus
from src.core.messaging.sse_broadcaster import get_sse_broadcaster
from src.core.observability.logging import setup_logging
from src.integrations.glpi import GlpiClient, render_glpi_template
from src.integrations.glpi.schemas import (
    GlpiImpact,
    GlpiPriority,
    GlpiTicketCreate,
    GlpiUrgency,
)
from src.workers.daemons.outbox_relay_worker import OutboxRelayWorker
from src.workers.daemons.token_cleanup_worker import TokenCleanupWorker

logger = logging.getLogger("infrawatch.lifespan")


async def _notify_glpi_startup(settings: Any) -> None:
    """Emite um ticket informativo (heartbeat) no GLPI indicando que o InfraWatch está operacional.

    Proteções contra spam:
    1. Desabilitado se GLPI_NOTIFY_STARTUP for False (evita abertura a cada reload de código).
    2. Debounce no Redis com TTL de 24h (mesmo habilitado, limita a 1 ticket por dia).
    """
    if not getattr(settings, "GLPI_ENABLED", False) or not getattr(settings, "GLPI_NOTIFY_STARTUP", False):
        return

    if settings.ENVIRONMENT == "test":
        return

    app_token = getattr(settings, "GLPI_APP_TOKEN", "")
    user_token = getattr(settings, "GLPI_USER_TOKEN", "")
    if not app_token or not user_token:
        logger.debug("Tokens do GLPI não configurados. Notificação de startup ignorada.")
        return

    try:
        # Trava de idempotência via Redis (TTL de 24 horas = 86400s)
        try:
            redis_client = get_redis_client()
            acquired = await redis_client.set("infrawatch:glpi:startup_heartbeat_sent", "1", nx=True, ex=86400)
            if not acquired:
                logger.debug("Ticket de inicialização já emitido nas últimas 24h (Redis debounce ativo).")
                return
        except Exception:
            logger.debug("Redis indisponível para lock de startup GLPI; prosseguindo com segurança.")

        async with GlpiClient(
            base_url=settings.GLPI_BASE_URL,
            app_token=app_token,
            user_token=user_token,
            timeout=getattr(settings, "GLPI_TIMEOUT_SECONDS", 10.0),
        ) as glpi:
            now_str = datetime.now(UTC).strftime("%d/%m/%Y às %H:%M:%S UTC")
            ticket_content = render_glpi_template(
                "startup_heartbeat.html",
                app_name=settings.APP_NAME,
                app_version=getattr(settings, "APP_VERSION", "0.1.0"),
                environment=settings.ENVIRONMENT,
                started_at=now_str,
            )
            ticket_payload = GlpiTicketCreate(
                name=f"🟢 [InfraWatch] Motor de Monitoramento no Ar — {settings.APP_NAME}",
                content=ticket_content,
                urgency=GlpiUrgency.VERY_LOW,
                impact=GlpiImpact.VERY_LOW,
                priority=GlpiPriority.VERY_LOW,
            )
            ticket_id = await glpi.open_ticket(ticket_payload)
            logger.info("Ticket de inicialização criado com sucesso no GLPI (#%d)", ticket_id)
    except Exception as exc:
        logger.warning("Não foi possível enviar notificação de inicialização ao GLPI: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gerencia inicialização e encerramento gracioso de recursos e conexões assíncronas."""
    settings = get_settings()
    logger.info(
        "Iniciando %s v%s no ambiente '%s' (DEBUG=%s)",
        getattr(settings, "PROJECT_NAME", "InfraWatch"),
        "0.1.0",
        settings.ENVIRONMENT,
        settings.DEBUG,
    )

    # 2. Inicializa banco de dados (fail-fast: valida conectividade no boot)
    engine = await init_db()
    app.state.engine = engine

    # 3. Inicializa Redis (global singleton, disponível em qualquer módulo via get_redis_client)
    await init_redis()

    # 4. Event bus
    event_bus = ResilientEventBus()
    app.state.event_bus = event_bus

    # 5. Background workers (apenas se habilitados)
    outbox_task: asyncio.Task[None] | None = None
    outbox_stop_event: asyncio.Event | None = None
    token_cleanup_worker: TokenCleanupWorker | None = None

    if settings.ENABLE_BACKGROUND_WORKERS and settings.ENVIRONMENT != "test":
        logger.info("Inicializando workers de segundo plano (OutboxRelay & TokenCleanup)...")
        try:
            # Workers usam get_redis_client() global - não precisam de redis_client passado no construtor
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
                worker_id="outbox-main",
            )
            outbox_task = asyncio.create_task(
                outbox_worker.run_forever(
                    poll_interval=settings.OUTBOX_RELAY_POLL_INTERVAL_SECONDS,
                    stop_event=outbox_stop_event,
                )
            )

            token_cleanup_worker = TokenCleanupWorker(
                redis_client=get_redis_client(),
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

    # 6. Heartbeat de inicialização no GLPI (não bloqueante)
    if settings.GLPI_ENABLED and settings.ENVIRONMENT != "test":
        asyncio.create_task(_notify_glpi_startup(settings))

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

        # Fecha Redis e DB (ordem inversa da inicialização)
        await close_redis()
        await event_bus.close()
        await close_db(engine)
        logger.info("Encerramento do ciclo de vida concluído com sucesso.")
