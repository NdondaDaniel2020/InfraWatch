"""API dependencies package for InfraWatch."""

from src.api.dependencies.auth import (
    AuthenticatedUser,
    CurrentUserDep,
    get_current_user,
)
from src.api.dependencies.ip_resolver import (
    ClientIPDep,
    get_client_ip,
)
from src.api.dependencies.metrics_auth import verify_metrics_auth
from src.api.dependencies.pagination import (
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)
from src.api.dependencies.rbac import (
    enforce_tenant_scope,
    require_roles,
)

__all__ = [
    "AuthenticatedUser",
    "ClientIPDep",
    "CurrentUserDep",
    "PaginationParams",
    "PaginationParamsDep",
    "enforce_tenant_scope",
    "get_client_ip",
    "get_current_user",
    "get_pagination_params",
    "require_roles",
    "verify_metrics_auth",
]
