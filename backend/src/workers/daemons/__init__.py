"""Workers em background (daemons)."""

from typing import Any

from src.workers.daemons.outbox_relay_worker import (
    EventPublisher,
    OutboxRelayWorker,
    PublishCallback,
)
from src.workers.daemons.outbox_relay_worker import (
    run_standalone as run_outbox_standalone,
)
from src.workers.daemons.token_cleanup_worker import (
    TokenCleanupWorker,
)
from src.workers.daemons.token_cleanup_worker import (
    run_standalone as run_cleanup_standalone,
)
from src.workers.daemons.zabbix_sync_worker import (
    ZabbixSyncWorker,
)

# Singletons dos workers
_outbox_worker: OutboxRelayWorker | None = None
_token_cleanup_worker: TokenCleanupWorker | None = None


def get_outbox_relay_worker(
    event_bus: Any,
    sse_broadcaster: Any,
    session_factory: Any = None,
    batch_size: int = 50,
    poll_interval: float = 30.0,
    worker_id: str = "outbox-main",
) -> OutboxRelayWorker:
    """Retorna instância singleton do OutboxRelayWorker configurada."""
    global _outbox_worker

    if _outbox_worker is None:
        async def dispatcher(event_type: str, payload: dict[str, Any]) -> None:
            await event_bus.publish(event_type, payload)
            target_user = payload.get("user_id") or payload.get("target_user_id")
            if target_user:
                try:
                    await sse_broadcaster.broadcast_to_user(str(target_user), event_type, payload)
                except Exception:
                    import logging
                    logging.getLogger("infrawatch.lifespan").warning(
                        "Falha ao encaminhar evento do Outbox para SSE", exc_info=True
                    )

        _outbox_worker = OutboxRelayWorker(
            publisher=dispatcher,
            session_factory=session_factory,
            batch_size=batch_size,
            worker_id=worker_id,
            poll_interval=poll_interval,
        )

    return _outbox_worker


def get_token_cleanup_worker(
    redis_client: Any = None,
    session_factory: Any = None,
    interval_seconds: int = 3600,
    lock_timeout: int = 300,
    retention_days: int = 7,
) -> TokenCleanupWorker:
    """Retorna instância singleton do TokenCleanupWorker."""
    global _token_cleanup_worker

    if _token_cleanup_worker is None:
        _token_cleanup_worker = TokenCleanupWorker(
            redis_client=redis_client,
            session_factory=session_factory,
            interval_seconds=interval_seconds,
            lock_timeout=lock_timeout,
            retention_days=retention_days,
        )

    return _token_cleanup_worker


async def close_workers() -> None:
    """Fecha todos os workers singleton."""
    global _outbox_worker, _token_cleanup_worker

    if _outbox_worker:
        await _outbox_worker.stop()
        _outbox_worker = None

    if _token_cleanup_worker:
        await _token_cleanup_worker.stop()
        _token_cleanup_worker = None


__all__ = [
    "EventPublisher",
    "OutboxRelayWorker",
    "PublishCallback",
    "TokenCleanupWorker",
    "ZabbixSyncWorker",
    "close_workers",
    "get_outbox_relay_worker",
    "get_token_cleanup_worker",
    "run_cleanup_standalone",
    "run_outbox_standalone",
]