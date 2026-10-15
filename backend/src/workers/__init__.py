"""InfraWatch background workers package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.workers.daemons.integration_worker import IntegrationWorker
    from src.workers.daemons.outbox_relay_worker import (
        EventPublisher,
        OutboxRelayWorker,
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
    from src.workers.daemons.zabbix_sync_worker import ZabbixSyncWorker


def __getattr__(name: str) -> Any:
    from src.workers import daemons

    if hasattr(daemons, name):
        return getattr(daemons, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "EventPublisher",
    "IntegrationWorker",
    "OutboxRelayWorker",
    "TokenCleanupWorker",
    "ZabbixSyncWorker",
    "run_cleanup_standalone",
    "run_outbox_standalone",
]
