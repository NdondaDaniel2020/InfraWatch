"""Roteadores da API do contexto de SLA."""

from src.contexts.sla.api.routes.maintenance_windows import router as maintenance_windows_router
from src.contexts.sla.api.routes.sla import router as sla_router

__all__ = [
    "maintenance_windows_router",
    "sla_router",
]
