"""Testes unitários para injeção de dependências e RBAC do contexto System."""

from __future__ import annotations

import pytest
from fastapi import HTTPException, status

from src.contexts.iam.api.dependencies import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.system.api.dependencies import (
    get_backup_service,
    get_integration_tester_service,
    require_admin,
)
from src.contexts.system.services.backup_service import BackupService
from src.contexts.system.services.integration_tester import IntegrationTesterService


def test_require_admin_allows_super_admin() -> None:
    """Valida que o papel SUPER_ADMIN ultrapassa a autorização com sucesso."""
    admin_user = AuthenticatedUser(
        id="usr-admin",
        email="admin@infrawatch.ao",
        role=UserRole.SUPER_ADMIN.value,
    )
    dep = require_admin()
    result = dep(admin_user)
    assert result == admin_user


def test_require_admin_allows_admin_alias() -> None:
    """Valida que a role legada 'ADMIN' também é aceita via is_super_admin."""
    admin_user = AuthenticatedUser(
        id="usr-admin-alias",
        email="admin-alias@infrawatch.ao",
        role="ADMIN",
    )
    dep = require_admin()
    result = dep(admin_user)
    assert result == admin_user


@pytest.mark.parametrize(
    "role",
    [
        UserRole.ORG_ADMIN.value,
        UserRole.NOC_OPERATOR.value,
        UserRole.CLIENT_VIEWER.value,
    ],
)
def test_require_admin_forbids_non_super_admin(role: str) -> None:
    """Valida que papéis não-superadministradores recebam HTTP 403 Forbidden."""
    regular_user = AuthenticatedUser(
        id="usr-regular",
        email="user@empresa.ao",
        role=role,
    )
    dep = require_admin()
    with pytest.raises(HTTPException) as exc_info:
        dep(regular_user)

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Acesso negado" in exc_info.value.detail


def test_get_integration_tester_service_provider() -> None:
    """Valida que o provedor retorne a instância do IntegrationTesterService."""
    service = get_integration_tester_service()
    assert isinstance(service, IntegrationTesterService)


def test_get_backup_service_provider() -> None:
    """Valida que o provedor retorne a instância do BackupService."""
    service = get_backup_service()
    assert isinstance(service, BackupService)
