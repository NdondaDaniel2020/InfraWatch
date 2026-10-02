"""Schemas Pydantic v2 para Gestão de Usuários."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.validators import validate_password_strength
from src.core.web.pagination import PaginatedResponse

EmailType = str


class UserCreate(BaseModel):
    """Payload para registro ou criação de usuário."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(..., description="Endereço de e-mail válido", max_length=255)
    password: str = Field(..., description="Senha em texto plano")
    full_name: str = Field(..., min_length=1, max_length=255, description="Nome completo")
    organization_id: UUID | None = Field(default=None, description="UUID da organização")
    role: UserRole | str = Field(
        default=UserRole.CLIENT_VIEWER, description="Papel inicial do usuário no RBAC"
    )

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("O nome completo não pode ser vazio.")
        return stripped


class UserUpdate(BaseModel):
    """Payload para atualização de perfil pelo próprio usuário autenticado."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=255)

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("O nome completo não pode ser vazio.")
        return stripped


class UserRolesUpdate(BaseModel):
    """Payload para atualização de papéis/roles por administradores."""

    model_config = ConfigDict(extra="forbid")

    role: UserRole = Field(..., description="Novo papel atribuído ao usuário")


class UserPublicResponse(BaseModel):
    """Perfil público serializado do usuário."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role: str
    organization_id: UUID | None = None
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    mfa_type: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class UserListResponse(PaginatedResponse[UserPublicResponse]):
    """Lista paginada de usuários para endpoints administrativos."""

    offset: int | None = None
    limit: int | None = None

    def model_post_init(self, context: Any, /) -> None:
        if self.offset is None:
            self.offset = (self.page - 1) * self.page_size
        if self.limit is None:
            self.limit = self.page_size
