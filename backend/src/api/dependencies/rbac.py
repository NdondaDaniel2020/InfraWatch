"""Dependências FastAPI de RBAC (Role-Based Access Control) e Isolamento Multi-tenant (ADR-012).

Implementa:
1. require_roles: Restrição de acesso por papéis de usuário.
2. enforce_tenant_scope: Bloqueio estrito de acesso cruzado entre organizações distintas.
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status

from src.api.dependencies.auth import (
    AuthenticatedUser,
    CurrentUserDep,
    get_current_user,
    oauth2_scheme,
)
from src.contexts.identity.domain.enums import UserRole


def require_roles(
    *allowed_roles: UserRole | str,
) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    """Fábrica de dependências para restringir rotas a papéis específicos.

    Super administradores (SUPER_ADMIN) possuem autorização universal e
    ultrapassam a checagem automaticamente.
    """
    valid_roles = {r.value if isinstance(r, UserRole) else str(r) for r in allowed_roles}

    def role_dependency(
        current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AuthenticatedUser:
        # SUPER_ADMIN tem privilégio irrestrito
        if current_user.is_super_admin:
            return current_user

        if current_user.role not in valid_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso negado. A operação requer um dos seguintes papéis: {', '.join(sorted(valid_roles))}.",
            )
        return current_user

    return role_dependency


def enforce_tenant_scope(
    target_organization_id: UUID | str | None,
    current_user: AuthenticatedUser,
) -> str | None:
    """Garante isolamento multi-tenant estrito entre organizações distintas.

    Regras:
    - SUPER_ADMIN e NOC_OPERATOR possuem visão global de suporte da RCS Angola.
    - ORG_ADMIN e CLIENT_VIEWER só podem acessar recursos com seu próprio organization_id.

    Raises:
        HTTPException(403): Se um usuário tentar acessar recursos de outro tenant.
    """
    if target_organization_id is None:
        return current_user.organization_id

    target_str = str(target_organization_id)

    # Papéis operacionais globais da RCS têm permissão cross-tenant
    if current_user.is_super_admin or current_user.role == UserRole.NOC_OPERATOR:
        return target_str

    # Usuários vinculados a clientes devem acessar estritamente seu próprio tenant
    if current_user.organization_id != target_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: você não tem permissão para visualizar dados de outra organização.",
        )

    return target_str


__all__ = [
    "AuthenticatedUser",
    "CurrentUserDep",
    "enforce_tenant_scope",
    "get_current_user",
    "oauth2_scheme",
    "require_roles",
]
