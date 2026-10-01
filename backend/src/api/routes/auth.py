"""Rotas REST da API para Autenticação e Gestão de Sessões (ADR-003, ADR-020)."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status

from src.api.dependencies import ClientIPDep, CurrentUserDep
from src.api.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
)
from src.contexts.identity.domain.events import (
    UserLoggedInEvent,
    UserLoggedOutEvent,
)
from src.contexts.identity.repositories.user_repository import UserRepository
from src.contexts.identity.services.auth_service import AuthService
from src.contexts.identity.services.token_service import TokenService
from src.core.database.session import DbSessionDep
from src.core.events.outbox_repository import OutboxRepository
from src.core.exceptions import (
    AccountLockoutError,
    AuthenticationError,
    RateLimitExceededError,
    TokenExpiredError,
    TokenRevokedError,
)

logger = logging.getLogger("infrawatch.api.auth")

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, summary="Autenticação com e-mail e senha")
async def login(
    body: LoginRequest,
    request: Request,
    client_ip: ClientIPDep,
    db: DbSessionDep,
) -> TokenResponse:
    """Valida credenciais do usuário sob proteção contra Timing Attack e Rate Limiting.

    Gera par de tokens JWT (Access) e opaco (Refresh). Emite evento transacional
    UserLoggedInEvent registrado na tabela outbox_events para processamento assíncrono.
    """
    auth_service = AuthService(db)
    try:
        user = await auth_service.authenticate(
            email=body.email,
            password=body.password,
            client_ip=client_ip,
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except (AccountLockoutError, RateLimitExceededError) as exc:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if exc.retry_after_seconds else {}
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=exc.message,
            headers=headers,
        ) from None

    # Cria par de tokens
    token_service = TokenService(db)
    user_agent = request.headers.get("user-agent")
    token_pair = await token_service.create_token_pair(
        user_id=user.id,
        email=user.email,
        role=user.role,
        organization_id=user.organization_id,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    # Registra evento de auditoria via Transactional Outbox (sem BackgroundTasks)
    event = UserLoggedInEvent(
        aggregate_id=user.id,
        user_id=user.id,
        email=user.email,
        ip_address=client_ip,
        user_agent=user_agent,
        organization_id=user.organization_id,
    )
    OutboxRepository.add_event(db, event, aggregate_type="User")
    await db.commit()

    return TokenResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        token_type="Bearer",
        expires_in=token_pair.expires_in,
    )


@router.post("/refresh", response_model=TokenResponse, summary="Rotação de Refresh Token")
async def refresh_token_endpoint(
    body: RefreshTokenRequest,
    request: Request,
    client_ip: ClientIPDep,
    db: DbSessionDep,
) -> TokenResponse:
    """Rotaciona o refresh token sob tolerância de concorrência (grace period)."""
    token_service = TokenService(db)
    user_agent = request.headers.get("user-agent")

    try:
        token_pair = await token_service.rotate_refresh_token(
            old_refresh_token=body.refresh_token,
            ip_address=client_ip,
            user_agent=user_agent,
        )
    except (TokenRevokedError, TokenExpiredError, AuthenticationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=getattr(exc, "message", "Refresh token inválido, expirado ou revogado."),
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    await db.commit()

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
    db: DbSessionDep,
) -> dict[str, str]:
    """Invalida o refresh token no banco de dados e registra evento de auditoria no outbox."""
    token_service = TokenService(db)
    await token_service.revoke_refresh_token(body.refresh_token, reason="User logout")

    # Registra evento no outbox
    user_uuid = UUID(current_user.id)
    event = UserLoggedOutEvent(
        aggregate_id=user_uuid,
        user_id=user_uuid,
        email=current_user.email,
        reason="User logout",
    )
    OutboxRepository.add_event(db, event, aggregate_type="User")
    await db.commit()

    return {"status": "ok", "message": "Sessão encerrada com sucesso."}


@router.get("/me", response_model=UserResponse, summary="Perfil do usuário autenticado")
async def get_my_profile(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UserResponse:
    """Retorna os dados cadastrais e permissões do usuário atualmente conectado."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(UUID(current_user.id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    return UserResponse.model_validate(user)
