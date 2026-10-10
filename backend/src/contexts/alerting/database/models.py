"""Mapeamento ORM SQLAlchemy do contexto de Alerting e Gestão de Incidentes."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.contexts.alerting.domain.incident import (
    Incident,
    IncidentSeverity,
    IncidentStatus,
)
from src.core.database.base_model import Base
from src.core.domain.entity import generate_uuid7


class IncidentModel(Base):
    """Mapeamento ORM da tabela `incidents`."""

    __tablename__ = "incidents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=generate_uuid7)
    device_id: Mapped[UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    operator_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=IncidentSeverity.CRITICAL.value,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=IncidentStatus.TRIGGERED.value,
        index=True,
    )

    glpi_ticket_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        default=lambda: datetime.now(UTC),
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    downtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
        Index("ix_incidents_status_started_at", "status", "started_at"),
        Index("ix_incidents_device_status", "device_id", "status"),
    )

    def to_domain(self) -> Incident:
        """Converte o modelo ORM para a entidade de domínio Incident."""
        return Incident(
            id=self.id,
            device_id=self.device_id,
            organization_id=self.organization_id,
            title=self.title,
            severity=self.severity,
            status=self.status,
            glpi_ticket_id=self.glpi_ticket_id,
            operator_id=self.operator_id,
            root_cause=self.root_cause,
            started_at=self.started_at,
            acknowledged_at=self.acknowledged_at,
            resolved_at=self.resolved_at,
            downtime_minutes=self.downtime_minutes,
            created_at=self.created_at,
        )

    @classmethod
    def from_domain(cls, incident: Incident) -> IncidentModel:
        """Instancia um novo modelo ORM a partir do agregado de domínio Incident."""
        return cls(
            id=incident.id,
            device_id=incident.device_id,
            organization_id=incident.organization_id,
            operator_id=incident.operator_id,
            title=incident.title,
            severity=incident.severity,
            status=incident.status.value,
            glpi_ticket_id=incident.glpi_ticket_id,
            root_cause=incident.root_cause,
            started_at=incident.started_at,
            acknowledged_at=incident.acknowledged_at,
            resolved_at=incident.resolved_at,
            downtime_minutes=incident.downtime_minutes,
            created_at=incident.created_at,
        )

    def update_from_domain(self, incident: Incident) -> None:
        """Sincroniza os atributos mutáveis do modelo com o estado do agregado."""
        self.operator_id = incident.operator_id
        self.status = incident.status.value
        self.glpi_ticket_id = incident.glpi_ticket_id
        self.root_cause = incident.root_cause
        self.acknowledged_at = incident.acknowledged_at
        self.resolved_at = incident.resolved_at
        self.downtime_minutes = incident.downtime_minutes
