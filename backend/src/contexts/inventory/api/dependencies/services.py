"""Injeção de dependências de repositórios e serviços de Inventário."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.inventory.services.device_command_service import DeviceCommandService
from src.contexts.inventory.services.device_query_service import DeviceQueryService
from src.core.web.dependencies import DbSessionDep, UnitOfWorkDep


def get_device_repository(session: DbSessionDep) -> DeviceRepository:
    """Provedor de dependência para repositório de dispositivos."""
    return DeviceRepository(session)


def get_device_command_service(
    uow: UnitOfWorkDep,
    repository: DeviceRepository = Depends(get_device_repository),
) -> DeviceCommandService:
    """Provedor de dependência para serviço de comandos de dispositivos."""
    return DeviceCommandService(uow, repository)


def get_device_query_service(session: DbSessionDep) -> DeviceQueryService:
    """Provedor de dependência para serviço de consultas de dispositivos."""
    return DeviceQueryService(session)


DeviceCommandServiceDep = Annotated[DeviceCommandService, Depends(get_device_command_service)]
DeviceQueryServiceDep = Annotated[DeviceQueryService, Depends(get_device_query_service)]

__all__ = [
    "DeviceCommandServiceDep",
    "DeviceQueryServiceDep",
    "get_device_command_service",
    "get_device_query_service",
    "get_device_repository",
]
