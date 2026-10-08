"""Entrypoint alias para execução do ZabbixSyncWorker via CLI ou Docker."""

import asyncio

from src.core.observability.logging import setup_logging
from src.workers.daemons.zabbix_sync_worker import ZabbixSyncWorker, main

__all__ = ["ZabbixSyncWorker", "main"]

if __name__ == "__main__":
    setup_logging()
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
