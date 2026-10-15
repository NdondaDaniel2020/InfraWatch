"""Schemas Pydantic para o endpoint de Heartbeat Passivo (RF-MON-01)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class HeartbeatSignalRequest(BaseModel):
    """Payload opcional enviado por cronjobs/rotinas batch no sinal de vida."""

    duration_ms: float | None = Field(
        default=None, ge=0.0, description="Duração da execução do batch em milissegundos"
    )
    status: str = Field(
        default="UP", description="Status reportado pelo processo: UP, WARNING ou ERROR"
    )
    message: str | None = Field(
        default=None, max_length=500, description="Mensagem ou resumo de execução do batch"
    )


class HeartbeatResponse(BaseModel):
    """Resposta de confirmação de recepção do sinal de vida."""

    status: str
    device_id: UUID
    received_at: datetime
    message: str
