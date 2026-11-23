"""Modelos Pydantic de saída (responses) para gestão de incidentes."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.contexts.alerting.domain.incident import Incident


class IncidentResponse(BaseModel):
    """Representação serializada de um incidente para consumo via API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_id: UUID
    organization_id: UUID | None = None
    operator_id: UUID | None = None
    title: str
    severity: str
    status: str
    glpi_ticket_id: int | None = None
    glpi_url: str | None = None
    root_cause: str | None = None
    started_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    downtime_minutes: int | None = None

    @classmethod
    def from_domain(cls, incident: Incident) -> IncidentResponse:
        """Constrói o DTO de resposta a partir da entidade de domínio Incident."""
        glpi_url: str | None = None
        if incident.glpi_ticket_id:
            try:
                from src.core.config import get_settings

                settings = get_settings()
                base_ui = (
                    settings.GLPI_PUBLIC_URL.strip().rstrip("/")
                    if getattr(settings, "GLPI_PUBLIC_URL", "")
                    else getattr(settings, "GLPI_BASE_URL", "").replace("/apirest.php", "").rstrip("/")
                )
                if base_ui:
                    glpi_url = f"{base_ui}/front/ticket.form.php?id={incident.glpi_ticket_id}"
            except Exception:
                pass

        return cls(
            id=incident.id,
            device_id=incident.device_id,
            organization_id=incident.organization_id,
            operator_id=incident.operator_id,
            title=incident.title,
            severity=incident.severity,
            status=incident.status.value,
            glpi_ticket_id=incident.glpi_ticket_id,
            glpi_url=glpi_url,
            root_cause=incident.root_cause,
            started_at=incident.started_at,
            acknowledged_at=incident.acknowledged_at,
            resolved_at=incident.resolved_at,
            downtime_minutes=incident.downtime_minutes,
        )


class IncidentListResponse(BaseModel):
    """Lista paginada de incidentes."""

    items: list[IncidentResponse]
    total: int
    page: int
    page_size: int
