"""Dependências FastAPI de RBAC (Role-Based Access Control) e Isolamento Multi-tenant (ADR-012).

Implementa:
1. get_current_user: Extração e validação do token JWT Bearer.
2. require_roles: Restrição de acesso por papéis de usuário.
3. enforce_tenant_scope: Bloqueio estrito de acesso cruzado entre organizações distintas.
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from src.api.dependencies.auth import AuthenticatedUser
from src.contexts.identity.domain.enums import UserRole
from src.core.security.tokens import decode_access_token


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """Extrai e valida o usuário autenticado a partir do cabeçalho Authorization: Bearer <token>."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Forneça o token no cabeçalho Authorization: Bearer.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou corrompido.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: identificador de usuário ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(
        id=str(user_id),
        email=str(payload.get("email", "")),
        role=str(payload.get("role", UserRole.CLIENT_VIEWER)),
        organization_id=payload.get("organization_id") or payload.get("org_id"),
    )


CurrentUserDep = Annotated[AuthenticatedUser, Depends(get_current_user)]


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
