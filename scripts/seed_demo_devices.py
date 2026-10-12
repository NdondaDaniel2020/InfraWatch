"""Script de Seed para cadastrar serviços locais e contêineres como ativos de monitoramento.

Entrypoint standalone para execução manual via CLI ou Makefile (make seed).
Reutiliza a lógica central e idempotente implementada em src.core.database.seed.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

# Garante inclusão do diretório backend no sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from src.core.database.seed import (  # type: ignore[import-untyped]
    DEMO_DEVICES,
    ensure_demo_organization,
    ensure_demo_users,
    seed_all,
    seed_devices,
    seed_incidents,
    seed_maintenance_windows,
    seed_metrics,
    seed_notifications,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("infrawatch.seed")


def main() -> None:
    try:
        asyncio.run(seed_all())
    except Exception:
        logger.exception("Falha ao executar seed")
        sys.exit(1)


if __name__ == "__main__":
    main()

__all__ = [
    "DEMO_DEVICES",
    "ensure_demo_organization",
    "ensure_demo_users",
    "main",
    "seed_all",
    "seed_devices",
    "seed_incidents",
    "seed_maintenance_windows",
    "seed_metrics",
    "seed_notifications",
]
