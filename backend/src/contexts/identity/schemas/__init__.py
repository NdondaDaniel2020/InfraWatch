"""Centralização e reexportação dos schemas Pydantic do contexto de Identidade."""

from src.contexts.identity.schemas.auth import (
    AuthResponse,
    EmailType,
    EmailVerificationConfirm,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    TokenResponse,
    UserResponse,
)
from src.contexts.identity.schemas.mfa import (
    MfaBackupCodesResponse,
    MfaChallengeRequest,
    MfaDisableRequest,
    MfaEnableRequest,
    MfaEnableResponse,
    MfaRegenerateBackupCodesRequest,
    MfaSetupResponse,
)
from src.contexts.identity.schemas.session import (
    SessionListResponse,
    SessionResponse,
    SessionRevokeResponse,
)
from src.contexts.identity.schemas.user import (
    UserCreate,
    UserListResponse,
    UserPublicResponse,
    UserRolesUpdate,
    UserUpdate,
)
from src.contexts.identity.schemas.validators import validate_password_strength

__all__ = [
    "AuthResponse",
    "EmailType",
    "EmailVerificationConfirm",
    "LoginRequest",
    "MfaBackupCodesResponse",
    "MfaChallengeRequest",
    "MfaDisableRequest",
    "MfaEnableRequest",
    "MfaEnableResponse",
    "MfaRegenerateBackupCodesRequest",
    "MfaSetupResponse",
    "PasswordResetConfirm",
    "PasswordResetRequest",
    "RefreshTokenRequest",
    "ResendVerificationRequest",
    "SessionListResponse",
    "SessionResponse",
    "SessionRevokeResponse",
    "TokenResponse",
    "UserCreate",
    "UserListResponse",
    "UserPublicResponse",
    "UserResponse",
    "UserRolesUpdate",
    "UserUpdate",
    "validate_password_strength",
]
