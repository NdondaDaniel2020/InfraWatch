"""Injeção de dependências de serviços e repositórios para o contexto de Topologia."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.network_topology.database.repository import TopologyRepository
from src.contexts.network_topology.services.topology_service import TopologyService
from src.core.web.dependencies import DbSessionDep, EventBusDep


def get_topology_repository(session: DbSessionDep) -> TopologyRepository:
    """Provedor de dependência para repositório de topologia."""
    return TopologyRepository(session)


def get_topology_service(
    session: DbSessionDep,
    event_bus: EventBusDep,
    repository: TopologyRepository = Depends(get_topology_repository),
) -> TopologyService:
    """Provedor de dependência para serviço de aplicação de topologia."""
    return TopologyService(
        uow_or_session=session,
        event_bus=event_bus,
        repository=repository,
    )


TopologyServiceDep = Annotated[TopologyService, Depends(get_topology_service)]

__all__ = [
    "TopologyServiceDep",
    "get_topology_repository",
    "get_topology_service",
]
