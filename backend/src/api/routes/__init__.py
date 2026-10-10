"""Rotas da camada de API da aplicação."""

from src.api.routes.incidents import router as incidents_router
from src.api.routes.maintenance_windows import router as maintenance_windows_router
from src.api.routes.sla import router as sla_router

__all__ = ["incidents_router", "maintenance_windows_router", "sla_router"]
