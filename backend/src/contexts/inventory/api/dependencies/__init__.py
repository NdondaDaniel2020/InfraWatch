"""Módulo público de dependências do contexto de Inventário."""

from __future__ import annotations

from src.contexts.inventory.api.dependencies.services import (
    DeviceCommandServiceDep,
    DeviceQueryServiceDep,
    get_device_command_service,
    get_device_query_service,
    get_device_repository,
)

__all__ = [
    "DeviceCommandServiceDep",
    "DeviceQueryServiceDep",
    "get_device_command_service",
    "get_device_query_service",
    "get_device_repository",
]
