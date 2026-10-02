"""Dependências HTTP da camada Web do Bounded Context IAM."""

from src.api.dependencies import (
    ClientIPDep,
    CurrentUserDep,
    PaginationParamsDep,
    enforce_tenant_scope,
    get_client_ip,
    get_current_user,
    get_pagination_params,
    oauth2_scheme,
    require_roles,
)

__all__ = [
    "ClientIPDep",
    "CurrentUserDep",
    "PaginationParamsDep",
    "enforce_tenant_scope",
    "get_client_ip",
    "get_current_user",
    "get_pagination_params",
    "oauth2_scheme",
    "require_roles",
]
