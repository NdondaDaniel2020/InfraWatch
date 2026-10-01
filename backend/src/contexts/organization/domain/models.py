"""Modelos ORM relacionais do contexto de Organizações (Tenants)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.contexts.organization.domain.enums import OrgTier
from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7

if TYPE_CHECKING:
    from src.contexts.identity.domain.models import AuditLogModel, UserModel


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

    # Relacionamentos com entidades externas de Identity
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
