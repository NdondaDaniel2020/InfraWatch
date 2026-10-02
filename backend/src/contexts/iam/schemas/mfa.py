"""Schemas Pydantic v2 para Autenticação Multifator (MFA/TOTP)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MfaSetupResponse(BaseModel):
    """Resposta com segredo e URI para configuração inicial do TOTP."""

    secret: str = Field(
        ...,
        description="Segredo Base32 do TOTP para inclusão manual no aplicativo autenticador",
    )
    otpauth_uri: str = Field(
        ...,
        description="URI no formato otpauth:// para geração de QR Code no frontend",
    )


class MfaEnableRequest(BaseModel):
    """Requisição para confirmar o setup inicial e habilitar o MFA."""

    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="Código TOTP de 6 dígitos gerado pelo aplicativo autenticador",
    )


class MfaEnableResponse(BaseModel):
    """Resposta com confirmação e códigos de backup gerados."""

    message: str = Field(
        default="MFA ativado com sucesso.",
        description="Mensagem de confirmação de ativação do MFA",
    )
    backup_codes: list[str] = Field(
        ...,
        description="Códigos de recuperação de uso único (salve em local seguro)",
    )


class MfaDisableRequest(BaseModel):
    """Requisição para desativar o MFA pelo próprio usuário."""

    password: str = Field(
        ...,
        description="Senha atual do usuário para confirmação de segurança",
    )
    code: str = Field(
        ...,
        description="Código TOTP de 6 dígitos ou código de backup para confirmação",
    )


class MfaChallengeRequest(BaseModel):
    """Requisição de resolução de desafio MFA durante o login."""

    mfa_pending_token: str = Field(
        ...,
        description="Token temporário intermediário gerado no primeiro estágio do login",
    )
    code: str = Field(
        ...,
        description="Código TOTP de 6 dígitos ou código de backup de recuperação",
    )


class MfaRegenerateBackupCodesRequest(BaseModel):
    """Requisição para regenerar códigos de backup."""

    password: str = Field(
        ...,
        description="Senha atual do usuário para confirmação de segurança",
    )


class MfaBackupCodesResponse(BaseModel):
    """Resposta contendo nova lista de códigos de backup."""

    backup_codes: list[str] = Field(
        ...,
        description="Nova lista de códigos de recuperação de uso único",
    )
