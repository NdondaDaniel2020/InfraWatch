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
from src.contexts.iam.api.dependencies.services import (
    AuditServiceDep,
    AuthServiceDep,
    GoogleAuthServiceDep,
    MfaServiceDep,
    NotificationServiceDep,
    OrganizationServiceDep,
    SessionServiceDep,
    TokenServiceDep,
    UserServiceDep,
    get_audit_service,
    get_auth_service,
    get_google_auth_service,
    get_mfa_service,
    get_notification_service,
    get_organization_service,
    get_session_service,
    get_token_service,
    get_user_service,
)
from src.core.pagination import (
    PaginatedResponse,
    PaginationParams,
    PaginationParamsDep,
    get_pagination_params,
)

__all__ = [
    "AuditServiceDep",
    "AuthServiceDep",
    "AuthenticatedUser",
    "ClientIPDep",
    "CurrentUserDep",
    "GoogleAuthServiceDep",
    "MfaServiceDep",
    "NotificationServiceDep",
    "OrganizationServiceDep",
    "PaginatedResponse",
    "PaginationParams",
    "PaginationParamsDep",
    "SessionServiceDep",
    "TokenServiceDep",
    "UserServiceDep",
    "enforce_tenant_scope",
    "get_audit_service",
    "get_auth_service",
    "get_client_ip",
    "get_current_user",
    "get_google_auth_service",
    "get_mfa_service",
    "get_notification_service",
    "get_organization_service",
    "get_pagination_params",
    "get_session_service",
    "get_token_service",
    "get_user_service",
    "oauth2_scheme",
    "require_roles",
]
