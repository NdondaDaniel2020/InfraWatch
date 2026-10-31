"""Injeção de dependências de serviços para o contexto System."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.system.services.backup_service import (
    BackupService,
    get_backup_service,
)
from src.contexts.system.services.integration_tester import (
    IntegrationTesterService,
    get_integration_tester_service,
)

IntegrationTesterDep = Annotated[
    IntegrationTesterService, Depends(get_integration_tester_service)
]
BackupServiceDep = Annotated[BackupService, Depends(get_backup_service)]

__all__ = [
    "BackupServiceDep",
    "IntegrationTesterDep",
    "get_backup_service",
    "get_integration_tester_service",
]
