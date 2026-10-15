"""Módulo público de dependências do contexto de SLA."""

from __future__ import annotations

from src.contexts.sla.api.dependencies.services import (
    SlaServiceDep,
    get_sla_service,
)

__all__ = [
    "SlaServiceDep",
    "get_sla_service",
]
