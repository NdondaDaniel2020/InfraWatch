"""Dependências HTTP da camada Web do Bounded Context IAM."""

from src.contexts.iam.api.dependencies.auth import (
    AuthenticatedUser,
    CurrentUserDep,
    get_current_user,
    oauth2_scheme,
)
from src.contexts.iam.api.dependencies.ip_resolver import (
    ClientIPDep,
    get_client_ip,
)
from src.contexts.iam.api.dependencies.rbac import (
    enforce_tenant_scope,
    require_roles,
)
from src.core.pagination import (
    PaginatedResponse,
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "AuthenticatedUser",
    "ClientIPDep",
    "CurrentUserDep",
    "PaginatedResponse",
    "PaginationParams",
    "PaginationParamsDep",
    "enforce_tenant_scope",
    "get_client_ip",
    "get_current_user",
    "get_pagination_params",
    "oauth2_scheme",
    "require_roles",
]
