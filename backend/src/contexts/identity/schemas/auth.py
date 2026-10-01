"""Schemas Pydantic v2 do contexto de Identidade e Autenticação."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

EmailType = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)]


class LoginRequest(BaseModel):
    """Corpo da requisição de autenticação."""

    model_config = ConfigDict(extra="forbid")

    email: EmailType
    password: str = Field(min_length=1, description="Senha do usuário em texto plano")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class RefreshTokenRequest(BaseModel):
    """Corpo da requisição de rotação de token."""

    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=1, description="Token de atualização opaco")


class TokenResponse(BaseModel):
    """Resposta contendo par de tokens de acesso e atualização."""

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = Field(description="Tempo de expiração do access token em segundos")


class UserResponse(BaseModel):
    """Representação serializada do perfil do usuário."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailType
    full_name: str
    role: str
    organization_id: UUID | None = None
    is_active: bool
    created_at: datetime
