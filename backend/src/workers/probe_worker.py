"""Entrypoint alias para execução do ProbeWorkerDaemon via CLI ou Docker."""

import asyncio

from src.core.observability.logging import setup_logging
from src.workers.daemons.probe_worker import ProbeWorkerDaemon, run_standalone

__all__ = ["ProbeWorkerDaemon", "run_standalone"]

if __name__ == "__main__":
    setup_logging()
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        pass
