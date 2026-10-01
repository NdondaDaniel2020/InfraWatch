"""API dependencies package for InfraWatch."""

from src.api.dependencies.auth import (
    AuthenticatedUser,
    SSECurrentUserDep,
    get_sse_current_user,
)

__all__ = [
    "AuthenticatedUser",
    "SSECurrentUserDep",
    "get_sse_current_user",
]
