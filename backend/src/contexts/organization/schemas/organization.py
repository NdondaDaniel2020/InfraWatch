"""Schemas Pydantic v2 do contexto de Organizações (Tenants)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.contexts.organization.domain.enums import OrgTier

EmailType = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)]


class OrganizationCreate(BaseModel):
    """Schema para cadastro de nova organização cliente."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=150, description="Nome corporativo da organização")
    slug: str = Field(
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9-]+$",
        description="Identificador único em formato URL-friendly",
    )
    contact_email: EmailType | None = Field(default=None, description="E-mail principal de contato")
    contact_phone: str | None = Field(
        default=None, max_length=50, description="Telefone de suporte"
    )
    tier: OrgTier = Field(default=OrgTier.STANDARD, description="Nível de serviço contratado")
    sla_target_default: Decimal = Field(
        default=Decimal("99.50"),
        ge=Decimal("0.00"),
        le=Decimal("100.00"),
        description="Meta padrão de SLA em porcentagem",
    )


class OrganizationResponse(BaseModel):
    """Representação serializada de uma organização cliente."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str | None = None
    contact_phone: str | None = None
    tier: str
    sla_target_default: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OrganizationListResponse(BaseModel):
    """Resposta paginada de listagem de organizações."""

    items: list[OrganizationResponse]
    total: int
    page: int
    size: int
