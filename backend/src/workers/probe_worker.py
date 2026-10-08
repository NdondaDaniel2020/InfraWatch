"""Entrypoint alias para execução do ProbeWorkerDaemon via CLI ou Docker."""

import asyncio
import logging

from src.workers.daemons.probe_worker import ProbeWorkerDaemon, run_standalone

__all__ = ["ProbeWorkerDaemon", "run_standalone"]

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        asyncio.run(run_standalone())
    except (KeyboardInterrupt, SystemExit):
        pass
