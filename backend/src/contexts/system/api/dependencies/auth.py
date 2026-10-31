"""Dependências de autenticação e RBAC do contexto System."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends

from src.contexts.iam.api.dependencies import AuthenticatedUser, require_roles
from src.contexts.iam.domain.enums import UserRole


def require_admin() -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    """Fábrica de dependência para autorização estrita de administradores globais."""
    return require_roles(UserRole.SUPER_ADMIN)


AdminUserDep = Annotated[AuthenticatedUser, Depends(require_admin())]

__all__ = [
    "AdminUserDep",
    "require_admin",
]
