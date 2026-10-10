"""Schemas Pydantic de entrada para o contexto de SLA e Janelas de Manutenção."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateMaintenanceWindowRequest(BaseModel):
    """Payload para agendamento de uma nova Janela de Manutenção Programada."""

    start_time: datetime = Field(..., description="Início programado da janela (UTC)")
    end_time: datetime = Field(..., description="Término programado da janela (UTC)")
    description: str = Field(..., min_length=3, max_length=1000, description="Justificativa técnica")
    device_id: UUID | None = Field(default=None, description="Dispositivo afetado ou nulo se global")
    organization_id: UUID | None = Field(default=None, description="Organização vinculada")
    is_approved: bool = Field(default=False, description="Status prévio de aprovação")

    @model_validator(mode="after")
    def validate_time_range(self) -> CreateMaintenanceWindowRequest:
        if self.end_time <= self.start_time:
            raise ValueError("O horário final da manutenção deve ser posterior ao horário inicial.")
        return self


class UpdateMaintenanceWindowRequest(BaseModel):
    """Payload para atualização de Janela de Manutenção."""

    start_time: datetime | None = Field(default=None, description="Novo início programado")
    end_time: datetime | None = Field(default=None, description="Novo término programado")
    description: str | None = Field(default=None, min_length=3, max_length=1000)
    device_id: UUID | None = Field(default=None)
    organization_id: UUID | None = Field(default=None)
    is_approved: bool | None = Field(default=None)

    @model_validator(mode="after")
    def validate_time_range(self) -> UpdateMaintenanceWindowRequest:
        if self.start_time is not None and self.end_time is not None and self.end_time <= self.start_time:
            raise ValueError("O horário final da manutenção deve ser posterior ao horário inicial.")
        return self
