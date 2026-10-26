"""Módulo público de dependências da API de Topologia de Rede."""

from __future__ import annotations

from src.contexts.network.topology.api.dependencies.services import (
    TopologyServiceDep,
    get_topology_repository,
    get_topology_service,
)

__all__ = [
    "TopologyServiceDep",
    "get_topology_repository",
    "get_topology_service",
]
