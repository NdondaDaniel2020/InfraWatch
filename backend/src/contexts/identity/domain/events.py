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
