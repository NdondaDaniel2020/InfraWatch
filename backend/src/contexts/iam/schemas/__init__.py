"""Centralização e reexportação dos schemas Pydantic do contexto de IAM (Identity & Access Management)."""

from src.contexts.iam.schemas.auth import (
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
from src.contexts.iam.schemas.google import (
    GoogleAuthUrlResponse,
    GoogleLoginRequest,
)
from src.contexts.iam.schemas.mfa import (
    MfaBackupCodesResponse,
    MfaChallengeRequest,
    MfaDisableRequest,
    MfaEnableRequest,
    MfaEnableResponse,
    MfaRegenerateBackupCodesRequest,
    MfaSetupResponse,
)
from src.contexts.iam.schemas.notification import (
    NotificationCreateRequest,
    NotificationListResponse,
    NotificationReadAllResponse,
    NotificationResponse,
    NotificationSyncResponse,
    NotificationUnreadCountResponse,
)
from src.contexts.iam.schemas.organization import (
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationResponse,
)
from src.contexts.iam.schemas.session import (
    SessionListResponse,
    SessionResponse,
    SessionRevokeResponse,
)
from src.contexts.iam.schemas.user import (
    UserCreate,
    UserListResponse,
    UserPublicResponse,
    UserRolesUpdate,
    UserUpdate,
)
from src.contexts.iam.schemas.validators import validate_password_strength

__all__ = [
    "AuthResponse",
    "EmailType",
    "EmailVerificationConfirm",
    "GoogleAuthUrlResponse",
    "GoogleLoginRequest",
    "LoginRequest",
    "MfaBackupCodesResponse",
    "MfaChallengeRequest",
    "MfaDisableRequest",
    "MfaEnableRequest",
    "MfaEnableResponse",
    "MfaRegenerateBackupCodesRequest",
    "MfaSetupResponse",
    "NotificationCreateRequest",
    "NotificationListResponse",
    "NotificationReadAllResponse",
    "NotificationResponse",
    "NotificationSyncResponse",
    "NotificationUnreadCountResponse",
    "OrganizationCreate",
    "OrganizationListResponse",
    "OrganizationResponse",
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
