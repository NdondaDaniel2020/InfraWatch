"""Injeção de dependências de serviços para o contexto System."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.contexts.system.services.backup_service import (
    BackupService,
    get_backup_service,
)
from src.contexts.system.services.dynamic_settings_provider import (
    DynamicSettingsProvider,
    get_dynamic_settings_provider,
)
from src.contexts.system.services.integration_tester import (
    IntegrationTesterService,
    get_integration_tester_service,
)
from src.contexts.system.services.system_settings_service import SystemSettingsService
from src.core.database.session import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession

IntegrationTesterDep = Annotated[
    IntegrationTesterService, Depends(get_integration_tester_service)
]
BackupServiceDep = Annotated[BackupService, Depends(get_backup_service)]
DynamicSettingsProviderDep = Annotated[
    DynamicSettingsProvider, Depends(get_dynamic_settings_provider)
]


async def get_system_settings_service(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    dynamic_provider: Annotated[DynamicSettingsProvider, Depends(get_dynamic_settings_provider)],
    integration_tester: Annotated[IntegrationTesterService, Depends(get_integration_tester_service)],
) -> SystemSettingsService:
    """Fábrica para injeção de dependência do SystemSettingsService."""
    return SystemSettingsService(
        session=session,
        dynamic_provider=dynamic_provider,
        integration_tester=integration_tester,
    )


SystemSettingsServiceDep = Annotated[
    SystemSettingsService, Depends(get_system_settings_service)
]

__all__ = [
    "BackupServiceDep",
    "DynamicSettingsProviderDep",
    "IntegrationTesterDep",
    "SystemSettingsServiceDep",
    "get_backup_service",
    "get_dynamic_settings_provider",
    "get_integration_tester_service",
    "get_system_settings_service",
]
