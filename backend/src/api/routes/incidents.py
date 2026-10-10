"""Roteamento de incidentes exportado para a camada de rotas de API da aplicação."""

from src.contexts.alerting.api.routes.incidents import router

__all__ = ["router"]
