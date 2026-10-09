"""Comandos de Domínio (Commands) do contexto IAM (Identity & Access Management).

Commands expressam intenções explícitas de mutação de estado de negócio.
São estruturas de dados imutáveis (dataclasses) desacopladas dos schemas
de entrada HTTP (Pydantic), garantindo a independência da camada de aplicação/domínio.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from src.contexts.iam.domain.enums import UserRole


@dataclass(frozen=True, slots=True)
class RegisterUserCommand:
    """Comando para registro de um novo usuário no sistema."""

    email: str
    password: str
    full_name: str
    organization_id: UUID | None = None
    role: UserRole | str = UserRole.CLIENT_VIEWER


@dataclass(frozen=True, slots=True)
class UpdateProfileCommand:
    """Comando para atualização de perfil cadastral do usuário."""

    user_id: UUID
    full_name: str | None = None


@dataclass(frozen=True, slots=True)
class ChangeUserRoleCommand:
    """Comando para atribuição de novos papéis RBAC."""

    user_id: UUID
    role: UserRole | str


@dataclass(frozen=True, slots=True)
class ActivateUserCommand:
    """Comando para ativação de uma conta de usuário."""

    user_id: UUID


@dataclass(frozen=True, slots=True)
class DeactivateUserCommand:
    """Comando para desativação de uma conta de usuário."""

    user_id: UUID
    reason: str = "Suspensão administrativa por conformidade de segurança"


@dataclass(frozen=True, slots=True)
class AdminDisableMfaCommand:
    """Comando de emergência administrativa para remoção de MFA."""

    user_id: UUID


@dataclass(frozen=True, slots=True)
class ChangePasswordCommand:
    """Comando para alteração de senha de usuário autenticado."""

    user_id: UUID
    current_password: str
    new_password: str


@dataclass(frozen=True, slots=True)
class ResetPasswordCommand:
    """Comando para redefinição de senha através de token opaco."""

    token: str
    new_password: str


__all__ = [
    "ActivateUserCommand",
    "AdminDisableMfaCommand",
    "ChangePasswordCommand",
    "ChangeUserRoleCommand",
    "DeactivateUserCommand",
    "RegisterUserCommand",
    "ResetPasswordCommand",
    "UpdateProfileCommand",
]
