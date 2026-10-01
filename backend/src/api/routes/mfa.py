"""Rotas REST da API para Autenticação Multifator (MFA/TOTP)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.api.dependencies import CurrentUserDep
from src.contexts.identity.schemas.mfa import (
    MfaBackupCodesResponse,
    MfaDisableRequest,
    MfaEnableRequest,
    MfaEnableResponse,
    MfaRegenerateBackupCodesRequest,
    MfaSetupResponse,
)
from src.contexts.identity.services.mfa_service import MfaService
from src.core.database.session import DbSessionDep
from src.core.exceptions import (
    AuthenticationError,
    InvalidMfaConfirmationError,
    InvalidTotpCodeError,
    MfaNotActiveError,
    MfaNotSetupError,
    NotFoundError,
)

router = APIRouter(prefix="/api/v1/mfa", tags=["MFA / Two-Factor Authentication"])


@router.post(
    "/setup",
    response_model=MfaSetupResponse,
    summary="Iniciar configuração de autenticação em dois fatores (TOTP)",
)
async def setup_mfa(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MfaSetupResponse:
    """Gera o segredo Base32 e a URI otpauth:// para leitura em aplicativos como Google Authenticator."""
    mfa_service = MfaService(db)
    user_uuid = UUID(current_user.id)
    try:
        secret, uri = await mfa_service.setup_totp(user_id=user_uuid, user_email=current_user.email)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    await db.commit()
    return MfaSetupResponse(secret=secret, otpauth_uri=uri)


@router.post(
    "/enable",
    response_model=MfaEnableResponse,
    summary="Ativar MFA após validação do código gerado no aplicativo",
)
async def enable_mfa(
    body: MfaEnableRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MfaEnableResponse:
    """Valida o primeiro código TOTP de 6 dígitos, habilita o MFA e entrega os códigos de recuperação."""
    mfa_service = MfaService(db)
    user_uuid = UUID(current_user.id)
    try:
        backup_codes = await mfa_service.enable_totp(user_id=user_uuid, code=body.code)
    except MfaNotSetupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from None
    except InvalidTotpCodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from None
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    await db.commit()
    return MfaEnableResponse(
        message="MFA ativado com sucesso. Guarde seus códigos de backup com segurança.",
        backup_codes=backup_codes,
    )


@router.post(
    "/disable",
    summary="Desativar MFA mediante senha e código de verificação",
)
async def disable_mfa(
    body: MfaDisableRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict[str, str]:
    """Permite ao usuário desativar o MFA fornecendo sua senha atual e código TOTP ou de backup."""
    mfa_service = MfaService(db)
    user_uuid = UUID(current_user.id)
    try:
        await mfa_service.disable_totp(
            user_id=user_uuid,
            password=body.password,
            code=body.code,
        )
    except (MfaNotActiveError, InvalidMfaConfirmationError, AuthenticationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from None
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    await db.commit()
    return {"status": "ok", "message": "MFA desativado com sucesso."}


@router.post(
    "/backup-codes/regenerate",
    response_model=MfaBackupCodesResponse,
    summary="Regenerar códigos de recuperação de backup",
)
async def regenerate_backup_codes(
    body: MfaRegenerateBackupCodesRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MfaBackupCodesResponse:
    """Invalida todos os códigos de backup antigos e emite 10 novos códigos descartáveis."""
    mfa_service = MfaService(db)
    user_uuid = UUID(current_user.id)
    try:
        new_codes = await mfa_service.regenerate_backup_codes(
            user_id=user_uuid,
            password=body.password,
        )
    except (MfaNotActiveError, AuthenticationError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from None
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    await db.commit()
    return MfaBackupCodesResponse(backup_codes=new_codes)
