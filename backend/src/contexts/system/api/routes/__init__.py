"""Exportação de rotas de sistema."""

from src.contexts.system.api.routes.backup import router as backup_router

__all__ = ["backup_router"]
