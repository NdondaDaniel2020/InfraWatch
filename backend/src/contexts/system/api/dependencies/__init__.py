"""Módulo público de dependências do contexto System."""

from __future__ import annotations

from src.contexts.system.api.dependencies.auth import (
    AdminUserDep,
    require_admin,
)
from src.contexts.system.api.dependencies.services import (
    BackupServiceDep,
    IntegrationTesterDep,
    get_backup_service,
    get_integration_tester_service,
)

__all__ = [
    "AdminUserDep",
    "BackupServiceDep",
    "IntegrationTesterDep",
    "get_backup_service",
    "get_integration_tester_service",
    "require_admin",
]
