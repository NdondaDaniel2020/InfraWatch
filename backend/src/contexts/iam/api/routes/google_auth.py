"""Rotas REST da API para Autenticação Social Google OAuth 2.0 / OpenID Connect."""

from __future__ import annotations

from fastapi import APIRouter, Request

from src.contexts.iam.schemas.auth import TokenResponse
from src.contexts.iam.schemas.google import GoogleAuthUrlResponse, GoogleLoginRequest
from src.contexts.iam.services.google_auth_service import (
    GoogleAuthService,
    build_authorization_url,
    create_google_state,
    ensure_google_login_enabled,
)
from src.core.database.session import DbSessionDep
from src.core.device import extract_client_ip

router = APIRouter(prefix="/api/v1/auth/google", tags=["Authentication - Google OAuth"])


@router.get(
    "/url",
    response_model=GoogleAuthUrlResponse,
    summary="Obter URL de autorização e estado CSRF para login com Google",
)
async def get_google_auth_url() -> GoogleAuthUrlResponse:
    """Retorna a URL de consentimento do Google e o token de estado CSRF assinado.

    O cliente deve redirecionar o navegador para a URL retornada. Após o consentimento,
    o Google redireciona de volta com o parâmetro 'code', que deve ser enviado para
    o endpoint POST /callback junto com o 'state'.
    """
    ensure_google_login_enabled()
    state = create_google_state()
    return GoogleAuthUrlResponse(
        authorization_url=build_authorization_url(state),
        state=state,
    )


@router.post(
    "/callback",
    response_model=TokenResponse,
    summary="Concluir autenticação social via código ou ID Token do Google",
)
async def google_auth_callback(
    data: GoogleLoginRequest,
    request: Request,
    db: DbSessionDep,
) -> TokenResponse:
    """Valida o código de autorização OAuth ou o ID Token OpenID Connect.

    Registra automaticamente novos usuários como verificados ou vincula a conta existente
    pelo endereço de e-mail verificado. Emite o par de tokens locais (Access JWT + Refresh Token).
    """
    client_ip = extract_client_ip(request)
    user_agent = request.headers.get("user-agent")

    service = GoogleAuthService(db)
    _user, tokens = await service.authenticate(
        data=data,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
    )
