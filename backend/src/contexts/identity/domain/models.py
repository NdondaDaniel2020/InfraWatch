"""Modelos ORM relacionais do contexto de Identidade e Multi-Tenancy.

Mapeia as entidades de persistência:
- OrganizationModel: Tenants e clientes atendidos pela plataforma NOC.
- UserModel: Usuários com controle de acesso RBAC e escopo multitenant.
- RefreshTokenModel: Persistência de refresh tokens com hash seguro para rotação e revogação.
- AuditLogModel: Trilha de auditoria append-only com integridade criptográfica e bloqueio de mutações.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    DDL,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    event,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from src.contexts.identity.domain.enums import AuditResult, UserRole
from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7
from src.core.exceptions import AuditImmutabilityError

# Suporte híbrido a JSONB no PostgreSQL e JSON genérico no SQLite/testes
JSONType = JSON().with_variant(JSONB, "postgresql")

from src.contexts.organization.domain.models import OrganizationModel


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
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_type: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
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
    mfa_methods: Mapped[list[MfaMethodModel]] = relationship(
        "MfaMethodModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    password_reset_tokens: Mapped[list[PasswordResetTokenModel]] = relationship(
        "PasswordResetTokenModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    email_verification_tokens: Mapped[list[EmailVerificationTokenModel]] = relationship(
        "EmailVerificationTokenModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list[NotificationModel]] = relationship(
        "NotificationModel",
        back_populates="user",
        cascade="all, delete-orphan",
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
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    replaced_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relacionamentos
    user: Mapped[UserModel] = relationship("UserModel", back_populates="refresh_tokens")

    __table_args__ = (Index("idx_refresh_tokens_lookup", "token_hash", "is_revoked", "expires_at"),)

    def __repr__(self) -> str:
        return (
            f"<RefreshTokenModel id={self.id} user_id={self.user_id} is_revoked={self.is_revoked}>"
        )


class PasswordResetTokenModel(Base):
    """Token de uso único para recuperação e redefinição de senha."""

    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index("ix_password_reset_tokens_token_hash", "token_hash", unique=True),
        Index("ix_password_reset_tokens_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    user: Mapped[UserModel] = relationship("UserModel", back_populates="password_reset_tokens")

    def __repr__(self) -> str:
        return f"<PasswordResetTokenModel user_id={self.user_id} used={self.used}>"


class EmailVerificationTokenModel(Base):
    """Token de uso único para confirmação de endereço de e-mail de novos usuários."""

    __tablename__ = "email_verification_tokens"
    __table_args__ = (
        Index("ix_email_verification_tokens_token_hash", "token_hash", unique=True),
        Index("ix_email_verification_tokens_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    user: Mapped[UserModel] = relationship("UserModel", back_populates="email_verification_tokens")

    def __repr__(self) -> str:
        return f"<EmailVerificationTokenModel user_id={self.user_id} used={self.used}>"


class MfaMethodModel(Base):
    """Método de autenticação de dois fatores (TOTP / Backup Codes)."""

    __tablename__ = "mfa_methods"
    __table_args__ = (
        Index("ix_mfa_methods_user_id", "user_id"),
        Index("ix_mfa_methods_user_type", "user_id", "type"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False, default="totp")
    secret: Mapped[str | None] = mapped_column(String(512), nullable=True)
    data: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONType, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    user: Mapped[UserModel] = relationship("UserModel", back_populates="mfa_methods")

    def __repr__(self) -> str:
        return f"<MfaMethodModel id={self.id} user_id={self.user_id} type={self.type} active={self.is_active}>"


class NotificationModel(Base):
    """Mapeamento ORM da tabela notifications para histórico e streaming in-app."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_id", "user_id", "id"),
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="in_app")
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1024), nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    user: Mapped[UserModel] = relationship("UserModel", back_populates="notifications")

    def __repr__(self) -> str:
        return (
            f"<NotificationModel id={self.id} user_id={self.user_id} "
            f"event_type={self.event_type!r} read={self.read}>"
        )


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


# Triggers DDL no nível de banco de dados nativo (Defense in Depth)
sqlite_prevent_update = DDL("""
CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'A tabela audit_logs é append-only. Operações de UPDATE são proibidas.');
END;
""")

sqlite_prevent_delete = DDL("""
CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'A tabela audit_logs é append-only. Operações de DELETE são proibidas.');
END;
""")

pg_prevent_mutation_func = DDL("""
CREATE OR REPLACE FUNCTION block_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'A tabela audit_logs é append-only. Operações de UPDATE ou DELETE são proibidas.';
END;
$$ LANGUAGE plpgsql;
""")

pg_prevent_mutation_trigger = DDL("""
CREATE TRIGGER prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION block_audit_log_mutation();
""")

event.listen(
    AuditLogModel.__table__,
    "after_create",
    sqlite_prevent_update.execute_if(dialect="sqlite"),
)
event.listen(
    AuditLogModel.__table__,
    "after_create",
    sqlite_prevent_delete.execute_if(dialect="sqlite"),
)
event.listen(
    AuditLogModel.__table__,
    "after_create",
    pg_prevent_mutation_func.execute_if(dialect="postgresql"),
)
event.listen(
    AuditLogModel.__table__,
    "after_create",
    pg_prevent_mutation_trigger.execute_if(dialect="postgresql"),
)


__all__ = [
    "AuditLogModel",
    "EmailVerificationTokenModel",
    "MfaMethodModel",
    "NotificationModel",
    "OrganizationModel",
    "PasswordResetTokenModel",
    "RefreshTokenModel",
    "UserModel",
]
