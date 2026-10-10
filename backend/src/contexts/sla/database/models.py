"""Mapeamento ORM SQLAlchemy do contexto de SLA e Janelas de Manutenção."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.contexts.sla.domain.models import MaintenanceWindow
from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


class MaintenanceWindowModel(Base):
    """Mapeamento ORM da tabela `maintenance_windows`."""

    __tablename__ = "maintenance_windows"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    device_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    is_approved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_maintenance_windows_device_period",
            "device_id",
            "start_time",
            "end_time",
        ),
    )

    def to_domain(self) -> MaintenanceWindow:
        """Converte a entidade relacional para a entidade de domínio."""
        return MaintenanceWindow(
            id=self.id,
            device_id=self.device_id,
            organization_id=self.organization_id,
            start_time=_ensure_utc(self.start_time) or self.start_time,
            end_time=_ensure_utc(self.end_time) or self.end_time,
            is_approved=self.is_approved,
            description=self.description,
            created_at=_ensure_utc(self.created_at),
        )

    @classmethod
    def from_domain(cls, window: MaintenanceWindow) -> MaintenanceWindowModel:
        """Instancia um novo modelo ORM a partir da entidade de domínio."""
        return cls(
            id=window.id,
            device_id=window.device_id,
            organization_id=window.organization_id,
            start_time=window.start_time,
            end_time=window.end_time,
            is_approved=window.is_approved,
            description=window.description,
            created_at=window.created_at,
        )

    def update_from_domain(self, window: MaintenanceWindow) -> None:
        """Atualiza atributos mutáveis a partir da entidade de domínio."""
        self.device_id = window.device_id
        self.organization_id = window.organization_id
        self.start_time = window.start_time
        self.end_time = window.end_time
        self.is_approved = window.is_approved
        self.description = window.description
