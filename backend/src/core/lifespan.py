"""Gerenciamento de ciclo de vida assíncrono (Startup e Teardown) da aplicação FastAPI."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.core.config import get_settings
from src.core.database.session import get_engine
from src.core.observability.logging import setup_logging

logger = logging.getLogger("infrawatch.lifespan")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gerencia inicialização e encerramento gracioso de recursos e conexões assíncronas."""
    # 1. Startup: inicializa logging estruturado e configurações
    setup_logging()
    settings = get_settings()
    logger.info(
        "Iniciando %s v%s no ambiente (DEBUG=%s)",
        getattr(settings, "PROJECT_NAME", "InfraWatch"),
        "0.1.0",
        settings.DEBUG,
    )

    engine = get_engine()

    try:
        yield
    finally:
        # 2. Teardown gracioso: encerra pools de conexão e libera recursos
        logger.info("Encerrando conexões de banco de dados e recursos em segundo plano...")
        await engine.dispose()
        logger.info("Encerramento concluído com sucesso.")
