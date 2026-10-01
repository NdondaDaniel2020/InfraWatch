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

__all__ = [
    "AuthenticatedUser",
    "ClientIPDep",
    "SSECurrentUserDep",
    "get_client_ip",
    "get_sse_current_user",
]
