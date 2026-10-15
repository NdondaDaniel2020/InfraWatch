from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CreateDeviceRequest(BaseModel):
    name: str = Field(..., max_length=255)
    hostname: str | None = Field(None, max_length=255)
    ip_address: str = Field(..., max_length=45)
    port: int = Field(..., ge=1, le=65535)
    protocol: str = Field(..., max_length=50)
    category: str = Field(..., max_length=50)
    interval_seconds: int = Field(60, ge=1)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    organization_id: UUID | None = None


class UpdateDeviceRequest(BaseModel):
    name: str | None = Field(None, max_length=255)
    hostname: str | None = Field(None, max_length=255)
    ip_address: str | None = Field(None, max_length=45)
    port: int | None = Field(None, ge=1, le=65535)
    protocol: str | None = Field(None, max_length=50)
    category: str | None = Field(None, max_length=50)
    interval_seconds: int | None = Field(None, ge=1)
    thresholds: dict[str, Any] | None = None
    device_id: UUID | None = None
    organization_id: UUID | None = None


class SetMaintenanceRequest(BaseModel):
    until: datetime = Field(..., description="Data/hora de fim da manutenção")
    title: str = Field("Manutenção API", description="Título descritivo da janela de manutenção")
    reason: str = Field("Manutenção agendada via API", description="Motivo detalhado da manutenção")
    device_id: UUID | None = None
    organization_id: UUID | None = None


class PauseDeviceRequest(BaseModel):
    reason: str = Field("Pausado via API", description="Motivo da pausa do monitoramento")
    device_id: UUID | None = None
    organization_id: UUID | None = None


class ResumeDeviceRequest(BaseModel):
    reason: str | None = Field(None, description="Motivo da retomada do monitoramento")
    device_id: UUID | None = None
    organization_id: UUID | None = None
