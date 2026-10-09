"""Ponto de entrada para inicialização do servidor Uvicorn/FastAPI do InfraWatch."""

import uvicorn

from src.core.config import get_settings
from src.core.observability.logging import get_uvicorn_log_config
from src.main import app

__all__ = ["app"]

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_config=get_uvicorn_log_config(),
        access_log=False,
    )
