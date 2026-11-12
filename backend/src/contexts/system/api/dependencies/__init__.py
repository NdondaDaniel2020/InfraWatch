"""Módulo público de dependências do contexto System."""

from __future__ import annotations

from src.contexts.system.api.dependencies.auth import (
    AdminUserDep,
    require_admin,
)
from src.contexts.system.api.dependencies.services import (
    BackupServiceDep,
    DynamicSettingsProviderDep,
    IntegrationTesterDep,
    SystemSettingsServiceDep,
    get_backup_service,
    get_dynamic_settings_provider,
    get_integration_tester_service,
    get_system_settings_service,
)

__all__ = [
    "AdminUserDep",
    "BackupServiceDep",
    "DynamicSettingsProviderDep",
    "IntegrationTesterDep",
    "SystemSettingsServiceDep",
    "get_backup_service",
    "get_dynamic_settings_provider",
    "get_integration_tester_service",
    "get_system_settings_service",
    "require_admin",
]
