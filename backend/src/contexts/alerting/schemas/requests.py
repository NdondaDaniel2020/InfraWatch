"""Modelos Pydantic de entrada (requests) para gestão de incidentes."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateIncidentRequest(BaseModel):
    """Payload para criação manual ou automatizada de incidente."""

    device_id: UUID = Field(..., description="ID do dispositivo relacionado")
    title: str = Field(..., min_length=3, max_length=255, description="Título descritivo do incidente")
    severity: str = Field(default="CRITICAL", description="Severidade (CRITICAL, DOWN, WARNING, DEGRADED)")
    organization_id: UUID | None = Field(default=None, description="ID da organização/tenant proprietária")


class AcknowledgeIncidentRequest(BaseModel):
    """Payload para reconhecimento formal de um incidente por operador."""

    acknowledged_at: datetime | None = Field(
        default=None,
        description="Carimbo opcional de reconhecimento (default: UTC atual)",
    )


class ResolveIncidentRequest(BaseModel):
    """Payload para encerramento de incidente com justificativa técnica."""

    root_cause: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Justificativa técnica e causa raiz apurada do incidente",
    )
    resolved_at: datetime | None = Field(
        default=None,
        description="Carimbo opcional de encerramento (default: UTC atual)",
    )
