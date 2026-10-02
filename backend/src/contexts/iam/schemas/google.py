"""Schemas Pydantic para fluxo de autenticação social Google OAuth 2.0 / OpenID Connect."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GoogleAuthUrlResponse(BaseModel):
    """Resposta contendo a URL de consentimento do Google e o estado CSRF assinado."""

    authorization_url: str = Field(
        description="URL para a qual o cliente deve redirecionar o navegador para autorização."
    )
    state: str = Field(
        description="Token de estado assinado (CSRF) que deve ser reenviado no callback."
    )


class GoogleLoginRequest(BaseModel):
    """Requisição para conclusão de autenticação via Google OAuth."""

    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(
        default=None,
        min_length=1,
        max_length=4096,
        description="Código de autorização retornado pelo Google no redirect URI.",
    )
    state: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
        description="Token de estado CSRF emitido originalmente pelo backend.",
    )
    id_token: str | None = Field(
        default=None,
        min_length=1,
        max_length=8192,
        description="ID Token JWT emitido diretamente pelo Google no client-side SDK.",
    )

    @model_validator(mode="after")
    def _require_exactly_one_credential(self) -> Any:
        has_code = self.code is not None
        has_id_token = self.id_token is not None

        if has_code == has_id_token:
            raise ValueError('Forneça exatamente uma credencial: "code" ou "id_token".')

        if has_code and self.state is None:
            raise ValueError('O parâmetro "state" é obrigatório ao autenticar via "code".')

        return self
