"""Fachada retrocompatível de dependências do contexto de SLA.

DEPRECATED: Prefira importar diretamente de `src.contexts.sla.api.dependencies`.
"""

from __future__ import annotations

from src.contexts.sla.api.dependencies.services import (
    SlaServiceDep,
    get_sla_service,
)

__all__ = [
    "SlaServiceDep",
    "get_sla_service",
]
