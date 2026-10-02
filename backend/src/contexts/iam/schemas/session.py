"""Schemas Pydantic v2 para Gestão de Sessões Ativas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SessionResponse(BaseModel):
    """Representação pública de uma sessão ativa de um usuário."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_name: str | None = None
    ip_address: str | None = None
    created_at: datetime
    expires_at: datetime
    is_current: bool = False


class SessionListResponse(BaseModel):
    """Lista de sessões ativas do usuário."""

    sessions: list[SessionResponse]
    total: int


class SessionRevokeResponse(BaseModel):
    """Resposta após revogação de uma ou mais sessões."""

    message: str
    revoked_count: int = 1
