"""Ponto de entrada para inicialização do servidor Uvicorn/FastAPI do InfraWatch."""

import uvicorn

from src.api.main import app
from src.core.config import get_settings

__all__ = ["app"]

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG or settings.ENVIRONMENT == "development",
    )
