"""Rotas REST da API para Autenticação, Recuperação de Acesso e Verificação (ADR-003, ADR-020)."""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from src.contexts.iam.api.dependencies import (
    AuthServiceDep,
    ClientIPDep,
    CurrentUserDep,
    SessionServiceDep,
    TokenServiceDep,
    UserServiceDep,
)
from src.contexts.iam.schemas.auth import (
    AuthResponse,
    EmailVerificationConfirm,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    ResendVerificationRequest,
    TokenResponse,
    UserResponse,
)
from src.contexts.iam.schemas.mfa import MfaChallengeRequest
from src.contexts.iam.schemas.user import UserCreate, UserPublicResponse
from src.core.exceptions import (
    AccountLockedOutError,
    AuthenticationError,
    EmailAlreadyExistsError,
    InvalidMfaChallengeError,
    InvalidMfaPendingTokenError,
    InvalidOrExpiredTokenError,
    NotFoundError,
    RateLimitExceededError,
    TokenAlreadyUsedError,
    TokenExpiredError,
    TokenRevokedError,
)

logger = logging.getLogger("infrawatch.api.auth")

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserPublicResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastro de novo usuário",
)
async def register(
    body: UserCreate,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Registra uma nova conta de usuário e dispara a geração de token de confirmação de e-mail."""
    try:
        user, _ = await user_service.register_user(
            email=body.email,
            password=body.password,
            full_name=body.full_name,
            organization_id=body.organization_id,
            role=body.role,
        )
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O e-mail informado já está cadastrado no sistema.",
        ) from None

    return UserPublicResponse.model_validate(user)


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Autenticação com e-mail e senha (JSON)",
)
async def login(
    body: LoginRequest,
    request: Request,
    client_ip: ClientIPDep,
    auth_service: AuthServiceDep,
) -> AuthResponse:
    """Valida credenciais do usuário sob proteção contra Timing Attack e Rate Limiting.

    Se o usuário possuir MFA ativo, retorna mfa_required=True com mfa_pending_token.
    Caso contrário, emite o par de tokens JWT/opaco e registra o evento UserLoggedInEvent no Outbox.
    """
    user_agent = request.headers.get("user-agent")
    try:
        user, token_pair = await auth_service.authenticate(
            email=body.email,
            password=body.password,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except (AccountLockedOutError, RateLimitExceededError) as exc:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else {}
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=exc.message,
            headers=headers,
        ) from None

    if user.mfa_enabled or isinstance(token_pair, str):
        # MFA é obrigatório para este usuário
        return AuthResponse(
            mfa_required=True,
            mfa_pending_token=str(token_pair),
        )

    return AuthResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type="Bearer",
        expires_in=token_pair.expires_in,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login-form",
    response_model=AuthResponse,
    summary="Autenticação compatível com formulário OAuth2 (Swagger UI /docs)",
)
async def login_form(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
    client_ip: ClientIPDep,
    auth_service: AuthServiceDep,
) -> AuthResponse:
    """Suporta autenticação nativa através do botão Authorize da documentação OpenAPI."""
    return await login(
        body=LoginRequest(email=form_data.username, password=form_data.password),
        request=request,
        client_ip=client_ip,
        auth_service=auth_service,
    )


@router.post(
    "/login/mfa-challenge",
    response_model=AuthResponse,
    summary="Resolução de desafio MFA após o login inicial",
)
async def login_mfa_challenge(
    body: MfaChallengeRequest,
    request: Request,
    client_ip: ClientIPDep,
    auth_service: AuthServiceDep,
) -> AuthResponse:
    """Valida o token intermediário e o código TOTP ou de backup, emitindo a sessão definitiva."""
    user_agent = request.headers.get("user-agent")
    try:
        user, token_pair = await auth_service.authenticate_mfa_challenge(
            mfa_pending_token=body.mfa_pending_token,
            code=body.code,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except (InvalidMfaChallengeError, InvalidMfaPendingTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    return AuthResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type="Bearer",
        expires_in=token_pair.expires_in,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Rotação de Refresh Token")
async def refresh_token_endpoint(
    body: RefreshTokenRequest,
    request: Request,
    client_ip: ClientIPDep,
    token_service: TokenServiceDep,
) -> TokenResponse:
    """Rotaciona o refresh token sob tolerância de concorrência (grace period)."""
    user_agent = request.headers.get("user-agent")

    try:
        token_pair = await token_service.rotate_refresh_token(
            raw_refresh_token=body.refresh_token,
            ip_address=client_ip,
            user_agent=user_agent,
        )
    except (TokenRevokedError, TokenExpiredError, AuthenticationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=getattr(exc, "message", "Refresh token inválido, expirado ou revogado."),
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    return TokenResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type="Bearer",
        expires_in=token_pair.expires_in,
    )


@router.post("/logout", summary="Encerramento de sessão e revogação de tokens")
async def logout(
    body: RefreshTokenRequest,
    current_user: CurrentUserDep,
    token_service: TokenServiceDep,
) -> dict[str, str]:
    """Invalida o refresh token no banco de dados e registra evento de auditoria no outbox."""
    await token_service.revoke_refresh_token(
        raw_refresh_token=body.refresh_token,
        user_id=UUID(current_user.id),
        email=current_user.email,
    )
    return {"status": "ok", "message": "Sessão encerrada com sucesso."}


@router.post("/logout/all", summary="Encerramento de todas as sessões ativas")
async def logout_all(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> dict[str, str]:
    """Revoga todas as sessões e tokens de atualização ativos do usuário."""
    user_uuid = UUID(current_user.id)
    count = await session_service.revoke_all_sessions(user_uuid)
    return {"status": "ok", "message": f"{count} sessão(ões) revogada(s) com sucesso."}


@router.post("/verify-email", summary="Confirmação de endereço de e-mail")
async def verify_email_endpoint(
    body: EmailVerificationConfirm,
    auth_service: AuthServiceDep,
) -> dict[str, str]:
    """Valida token recebido por e-mail e marca a conta do usuário como verificada."""
    try:
        await auth_service.verify_email(token=body.token)
    except (InvalidOrExpiredTokenError, TokenAlreadyUsedError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from None
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=exc.message,
        ) from None

    return {"status": "ok", "message": "E-mail verificado com sucesso."}


@router.post("/verify-email/resend", summary="Reenvio de confirmação de e-mail")
async def resend_verification_endpoint(
    body: ResendVerificationRequest,
    auth_service: AuthServiceDep,
) -> dict[str, str]:
    """Reenvia o e-mail de confirmação caso o usuário exista e ainda não esteja verificado."""
    await auth_service.resend_verification_email(email=body.email)
    return {
        "status": "ok",
        "message": "Se o e-mail estiver cadastrado e não verificado, um novo link foi enviado.",
    }


@router.post("/password-reset/request", summary="Solicitação de recuperação de senha")
async def request_password_reset_endpoint(
    body: PasswordResetRequest,
    auth_service: AuthServiceDep,
) -> dict[str, str]:
    """Gera um token seguro de redefinição de senha sem vazar a existência do e-mail."""
    await auth_service.request_password_reset(email=body.email)
    return {
        "status": "ok",
        "message": "Se o endereço estiver cadastrado, as instruções de redefinição foram enviadas.",
    }


@router.post("/password-reset/confirm", summary="Confirmação de redefinição de senha")
async def confirm_password_reset_endpoint(
    body: PasswordResetConfirm,
    auth_service: AuthServiceDep,
) -> dict[str, str]:
    """Redefine a senha do usuário utilizando o token opaco recebido."""
    try:
        await auth_service.reset_password(
            token=body.token,
            new_password=body.new_password,
        )
    except (InvalidOrExpiredTokenError, TokenAlreadyUsedError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from None
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=exc.message,
        ) from None

    return {"status": "ok", "message": "Senha redefinida com sucesso. Faça login com a nova senha."}


@router.get("/me", response_model=UserResponse, summary="Perfil do usuário autenticado")
async def get_my_profile(
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserResponse:
    """Retorna os dados cadastrais e permissões do usuário atualmente conectado."""
    try:
        user = await user_service.get_user_by_id(UUID(current_user.id))
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        ) from None

    return UserResponse.model_validate(user)
