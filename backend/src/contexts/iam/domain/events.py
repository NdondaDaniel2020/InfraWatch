"""Eventos de domínio do contexto de Identidade e Multi-Tenancy (ADR-003, ADR-020)."""

from dataclasses import dataclass
from uuid import UUID

from src.core.domain.events import DomainEvent


@dataclass(frozen=True)
class UserLoggedInEvent(DomainEvent):
    """Evento emitido quando um usuário realiza autenticação com sucesso."""

    user_id: UUID | None = None
    email: str = ""
    ip_address: str = ""
    user_agent: str | None = None
    organization_id: UUID | None = None


@dataclass(frozen=True)
class UserLoggedOutEvent(DomainEvent):
    """Evento emitido quando uma sessão de usuário é encerrada voluntariamente."""

    user_id: UUID | None = None
    email: str = ""
    reason: str = "User logout"


@dataclass(frozen=True)
class OrganizationCreatedEvent(DomainEvent):
    """Evento emitido quando uma nova organização tenant é criada no sistema."""

    organization_id: UUID | None = None
    name: str = ""
    slug: str = ""
    tier: str = ""

@dataclass(frozen=True)
class PasswordResetRequestedEvent(DomainEvent):
    """Evento emitido quando um pedido de redefinição de senha é criado."""
    email: str = ""
    reset_token: str = ""


@dataclass(frozen=True)
class PasswordChangedEvent(DomainEvent):
    """Evento emitido quando a senha de um usuário é alterada com sucesso."""
    email: str = ""


@dataclass(frozen=True)
class PasswordResetCompletedEvent(DomainEvent):
    """Evento emitido quando a redefinição de senha é concluída."""
    email: str = ""


@dataclass(frozen=True)
class EmailVerificationRequestedEvent(DomainEvent):
    """Evento emitido quando um token de verificação de e-mail é gerado."""
    email: str = ""
    verify_token: str = ""


@dataclass(frozen=True)
class EmailVerifiedEvent(DomainEvent):
    """Evento emitido quando o e-mail de um usuário é verificado com sucesso."""
    email: str = ""
    full_name: str = ""


@dataclass(frozen=True)
class AccountLockedEvent(DomainEvent):
    """Evento emitido quando uma conta é bloqueada temporariamente por tentativas excessivas."""
    email: str = ""
    block_minutes: int = 15


@dataclass(frozen=True)
class BackupCodeUsedEvent(DomainEvent):
    """Evento emitido quando um código de recuperação MFA é utilizado."""
    email: str = ""
    remaining_count: int = 0


@dataclass(frozen=True)
class ProfileUpdatedEvent(DomainEvent):
    """Evento emitido quando o perfil de um usuário é atualizado."""
    email: str = ""
    changed_fields: str = ""


@dataclass(frozen=True)
class RolesChangedEvent(DomainEvent):
    """Evento emitido quando o papel/role de um usuário é alterado."""
    email: str = ""
    new_roles: str = ""


@dataclass(frozen=True)
class AccountDeactivatedEvent(DomainEvent):
    """Evento emitido quando a conta de um usuário é desativada por um administrador."""
    email: str = ""
    reason: str = "Suspensão administrativa por conformidade de segurança"
