"""Schemas Pydantic para serialização de registros e verificação da trilha de auditoria."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.api.schemas.pagination import PaginatedResponse


class AuditLogResponse(BaseModel):
    """Representação serializada de um registro de auditoria imutável."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action: str
    resource_type: str
    resource_id: str
    actor_user_id: UUID | None = None
    organization_id: UUID | None = None
    result: str
    details: dict[str, Any] | None = None
    ip_address: str | None = None
    created_at: datetime
    previous_hash: str | None = None
    hash: str


class AuditListResponse(PaginatedResponse[AuditLogResponse]):
    """Resposta paginada de registros de auditoria."""

    offset: int | None = None
    limit: int | None = None

    def model_post_init(self, context: Any, /) -> None:
        if self.offset is None:
            self.offset = (self.page - 1) * self.page_size
        if self.limit is None:
            self.limit = self.page_size


class AuditIntegrityVerificationResponse(BaseModel):
    """Resultado da auditoria forense criptográfica da trilha de auditoria."""

    is_valid: bool = Field(
        description="Verdadeiro se a cadeia criptográfica de hashes está 100% intacta."
    )
    total_records: int = Field(description="Quantidade total de registros auditados.")
    violations: list[str] = Field(
        default_factory=list,
        description="Lista de quebras de integridade ou adulterações detectadas.",
    )
