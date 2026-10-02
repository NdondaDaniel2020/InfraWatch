"""API dependencies package for InfraWatch."""

from src.api.dependencies.auth import (
    AuthenticatedUser,
    SSECurrentUserDep,
    get_sse_current_user,
)
from src.api.dependencies.ip_resolver import (
    ClientIPDep,
    get_client_ip,
)
from src.api.dependencies.pagination import (
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)
from src.api.dependencies.rbac import (
    CurrentUserDep,
    enforce_tenant_scope,
    get_current_user,
    require_roles,
)

__all__ = [
    "AuthenticatedUser",
    "ClientIPDep",
    "CurrentUserDep",
    "PaginationParams",
    "PaginationParamsDep",
    "SSECurrentUserDep",
    "enforce_tenant_scope",
    "get_client_ip",
    "get_current_user",
    "get_pagination_params",
    "get_sse_current_user",
    "require_roles",
]
