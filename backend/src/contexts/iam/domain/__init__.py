"""Módulo de domínio do contexto IAM."""

from src.contexts.iam.domain.aggregate import User
from src.contexts.iam.domain.commands import (
    ActivateUserCommand,
    AdminDisableMfaCommand,
    ChangePasswordCommand,
    ChangeUserRoleCommand,
    DeactivateUserCommand,
    RegisterUserCommand,
    ResetPasswordCommand,
    UpdateProfileCommand,
)
from src.contexts.iam.domain.enums import (
    AuditAction,
    AuditResult,
    OrgTier,
    TokenType,
    UserRole,
)
from src.contexts.iam.domain.value_objects import (
    Email,
    HashedPassword,
    RawPassword,
    Role,
)

__all__ = [
    "ActivateUserCommand",
    "AdminDisableMfaCommand",
    "AuditAction",
    "AuditResult",
    "ChangePasswordCommand",
    "ChangeUserRoleCommand",
    "DeactivateUserCommand",
    "Email",
    "HashedPassword",
    "OrgTier",
    "RawPassword",
    "RegisterUserCommand",
    "ResetPasswordCommand",
    "Role",
    "TokenType",
    "UpdateProfileCommand",
    "User",
    "UserRole",
]
