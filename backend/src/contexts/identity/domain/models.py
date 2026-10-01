"""Modelos ORM relacionais do contexto de Identidade e Multi-Tenancy.

Mapeia as entidades de persistência:
- OrganizationModel: Tenants e clientes atendidos pela plataforma NOC.
- UserModel: Usuários com controle de acesso RBAC e escopo multitenant.
- RefreshTokenModel: Persistência de refresh tokens com hash seguro para rotação e revogação.
- AuditLogModel: Trilha de auditoria append-only com integridade criptográfica e bloqueio de mutações.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    event,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from src.contexts.identity.domain.enums import AuditResult, OrgTier, UserRole
from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7
from src.core.exceptions import AuditImmutabilityError

# Suporte híbrido a JSONB no PostgreSQL e JSON genérico no SQLite/testes
JSONType = JSON().with_variant(JSONB, "postgresql")


class OrganizationModel(Base):
    """Mapeamento ORM da tabela organizations."""

    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sla_target_default: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("99.50"),
    )
    tier: Mapped[str] = mapped_column(String(30), nullable=False, default=OrgTier.STANDARD)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relacionamentos
    users: Mapped[list[UserModel]] = relationship(
        "UserModel",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list[AuditLogModel]] = relationship(
        "AuditLogModel",
        back_populates="organization",
    )

    def __repr__(self) -> str:
        return f"<OrganizationModel id={self.id} slug={self.slug!r} tier={self.tier!r}>"


class UserModel(Base):
    """Mapeamento ORM da tabela users."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column("hashed_password", String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=UserRole.CLIENT_VIEWER,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Propriedade de compatibilidade mútua password_hash / hashed_password
    @property
    def password_hash(self) -> str:
        return self.hashed_password

    @password_hash.setter
    def password_hash(self, value: str) -> None:
        self.hashed_password = value

    # Relacionamentos
    organization: Mapped[OrganizationModel | None] = relationship(
        "OrganizationModel",
        back_populates="users",
    )
    refresh_tokens: Mapped[list[RefreshTokenModel]] = relationship(
        "RefreshTokenModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list[AuditLogModel]] = relationship(
        "AuditLogModel",
        back_populates="actor_user",
    )

    def __repr__(self) -> str:
        return f"<UserModel id={self.id} email={self.email!r} role={self.role!r}>"


class RefreshTokenModel(Base):
    """Mapeamento ORM da tabela refresh_tokens."""

    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    replaced_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relacionamentos
    user: Mapped[UserModel] = relationship("UserModel", back_populates="refresh_tokens")

    __table_args__ = (
        Index("idx_refresh_tokens_lookup", "token_hash", "is_revoked", "expires_at"),
    )

    def __repr__(self) -> str:
        return f"<RefreshTokenModel id={self.id} user_id={self.user_id} is_revoked={self.is_revoked}>"


class AuditLogModel(Base):
    """Mapeamento ORM da tabela audit_logs (append-only e imutável)."""

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[str] = mapped_column(String(16), nullable=False, default=AuditResult.SUCCESS)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Relacionamentos
    organization: Mapped[OrganizationModel | None] = relationship(
        "OrganizationModel",
        back_populates="audit_logs",
    )
    actor_user: Mapped[UserModel | None] = relationship(
        "UserModel",
        back_populates="audit_logs",
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLogModel id={self.id} action={self.action!r} "
            f"resource={self.resource_type}:{self.resource_id} result={self.result!r}>"
        )


# Proteção de imutabilidade no nível ORM (append-only)
@event.listens_for(AuditLogModel, "before_update")
def _block_audit_log_orm_update(mapper: Any, connection: Any, target: Any) -> None:
    raise AuditImmutabilityError(
        "A tabela audit_logs é append-only. Operações de UPDATE são estritamente proibidas."
    )


@event.listens_for(AuditLogModel, "before_delete")
def _block_audit_log_orm_delete(mapper: Any, connection: Any, target: Any) -> None:
    raise AuditImmutabilityError(
        "A tabela audit_logs é append-only. Operações de DELETE são estritamente proibidas."
    )
