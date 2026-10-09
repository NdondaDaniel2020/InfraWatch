"""Application lifespan management for InfraWatch.

Handles startup/shutdown of database, Redis, event bus, and background workers.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from src.core.config import get_settings
from src.core.database.init_db import close_db, init_db
from src.core.infrastructure.redis import close_redis, init_redis
from src.core.messaging import get_event_bus, get_sse_broadcaster
from src.core.observability.logging import setup_logging
from src.integrations.glpi import get_glpi_notifier
from src.integrations.zabbix import get_zabbix_notifier
from src.workers.daemons import (
    get_outbox_relay_worker,
    get_token_cleanup_worker,
)

logger = __import__("logging").getLogger("infrawatch.lifespan")


# --- Compatibilidade retroativa para testes existentes ---

async def _notify_glpi_startup(settings: Any) -> None:
    """Wrapper de compatibilidade para _notify_glpi_startup."""
    notifier = get_glpi_notifier()
    await notifier.notify_startup()


async def _notify_zabbix_startup(settings: Any) -> None:
    """Wrapper de compatibilidade para _notify_zabbix_startup."""
    notifier = get_zabbix_notifier()
    await notifier.notify_startup()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    """Gerencia inicialização e encerramento gracioso de recursos e conexões assíncronas."""
    setup_logging()
    settings = get_settings()

    logger.info(
        "Iniciando %s v%s no ambiente '%s' (DEBUG=%s)",
        getattr(settings, "PROJECT_NAME", "InfraWatch"),
        getattr(settings, "APP_VERSION", "0.1.0"),
        settings.ENVIRONMENT,
        settings.DEBUG,
    )

    engine = None
    event_bus = None
    outbox_worker = None
    token_cleanup_worker = None

    try:
        # 1. Infraestrutura core (ordem: DB -> Redis -> Messaging)
        engine = await init_db()
        app.state.engine = engine

        await init_redis()

        event_bus = get_event_bus()
        app.state.event_bus = event_bus

        # 2. Workers de background (se habilitados)
        if settings.ENABLE_BACKGROUND_WORKERS and settings.ENVIRONMENT != "test":
            logger.info("Inicializando workers de segundo plano...")
            try:
                # Outbox Relay Worker
                outbox_worker = get_outbox_relay_worker(
                    event_bus=event_bus,
                    sse_broadcaster=get_sse_broadcaster(),
                    session_factory=None,  # usa factory global
                    batch_size=settings.OUTBOX_RELAY_BATCH_SIZE,
                    poll_interval=settings.OUTBOX_RELAY_POLL_INTERVAL_SECONDS,
                    worker_id="outbox-main",
                )
                await outbox_worker.start()

                # Token Cleanup Worker
                token_cleanup_worker = get_token_cleanup_worker(
                    redis_client=None,  # usa client global
                    session_factory=None,  # usa factory global
                    interval_seconds=settings.TOKEN_CLEANUP_INTERVAL_SECONDS,
                    lock_timeout=settings.TOKEN_CLEANUP_LOCK_TIMEOUT_SECONDS,
                    retention_days=settings.TOKEN_CLEANUP_RETENTION_DAYS,
                )
                # start() é síncrono - retorna Task
                token_cleanup_worker.start()

                app.state.outbox_worker = outbox_worker
                app.state.token_cleanup_worker = token_cleanup_worker
                if hasattr(outbox_worker, "_task") and outbox_worker._task:
                    app.state.outbox_task = outbox_worker._task
                logger.info("Workers de segundo plano iniciados com sucesso.")
            except Exception:
                logger.exception("Falha ao inicializar workers de segundo plano no startup")

        # 3. Notificações de startup (não bloqueantes, fire-and-forget)
        if settings.ENVIRONMENT != "test":
            glpi_notifier = get_glpi_notifier()
            if glpi_notifier.enabled:
                asyncio.create_task(glpi_notifier.notify_startup())

            zabbix_notifier = get_zabbix_notifier()
            if zabbix_notifier.enabled:
                asyncio.create_task(zabbix_notifier.notify_startup())

        yield
    finally:
        logger.info("Encerrando workers e conexões...")

        # 1. Workers (ordem inversa da inicialização)
        if outbox_worker:
            try:
                await outbox_worker.stop()
            except Exception:
                logger.exception("Erro ao parar outbox worker durante teardown")

        if token_cleanup_worker:
            try:
                await token_cleanup_worker.stop()
            except Exception:
                logger.exception("Erro ao parar token cleanup worker durante teardown")

        # 2. Infraestrutura core (ordem inversa)
        try:
            await close_redis()
        except Exception:
            logger.exception("Erro ao fechar conexao com Redis durante teardown")

        if event_bus:
            try:
                await event_bus.close()
            except Exception:
                logger.exception("Erro ao fechar event bus durante teardown")

        if engine:
            try:
                await close_db(engine)
            except Exception:
                logger.exception("Erro ao fechar conexoes com banco de dados durante teardown")

        logger.info("Encerramento do ciclo de vida concluído.")