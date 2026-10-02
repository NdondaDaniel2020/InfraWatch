"""Schemas Pydantic v2 do contexto de Identidade e Autenticação."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.contexts.iam.schemas.validators import validate_password_strength

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
    is_verified: bool = False
    mfa_enabled: bool = False
    created_at: datetime


class AuthResponse(BaseModel):
    """Resposta flexível de autenticação suportando desafio MFA intermediário."""

    mfa_required: bool = False
    mfa_pending_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int | None = None
    user: UserResponse | None = None


class PasswordResetRequest(BaseModel):
    """Solicitação de redefinição de senha."""

    model_config = ConfigDict(extra="forbid")

    email: EmailType

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class PasswordResetConfirm(BaseModel):
    """Confirmação de redefinição de senha via token opaco."""

    model_config = ConfigDict(extra="forbid")

    token: str = Field(
        min_length=1, description="Token de redefinição de senha recebido por e-mail"
    )
    new_password: str = Field(
        description="Nova senha em conformidade com as regras de complexidade"
    )

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class EmailVerificationConfirm(BaseModel):
    """Confirmação de e-mail através do token."""

    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, description="Token de verificação de e-mail")


class ResendVerificationRequest(BaseModel):
    """Solicitação de reenvio de e-mail de verificação."""

    model_config = ConfigDict(extra="forbid")

    email: EmailType

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()
