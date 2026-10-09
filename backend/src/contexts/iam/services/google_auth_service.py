"""Serviço de autenticação social Google OAuth 2.0 e OpenID Connect (OIDC)."""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt as pyjwt
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.enums import AuditAction, UserRole
from src.contexts.iam.database.models import UserModel
from src.contexts.iam.repositories.user_repository import UserRepository
from src.contexts.iam.schemas.google import GoogleLoginRequest
from src.contexts.iam.services.audit_service import AuditService
from src.contexts.iam.services.token_service import TokenPairResponse, TokenService
from src.core.config import get_settings
from src.core.exceptions import (
    GoogleAuthError,
    GoogleLoginDisabledError,
    InvalidGoogleTokenError,
)

logger = logging.getLogger("infrawatch.iam.google_auth")


def ensure_google_login_enabled() -> None:
    """Verifica se o login via Google está habilitado nas configurações."""
    if not get_settings().GOOGLE_LOGIN_ENABLED:
        raise GoogleLoginDisabledError()


def create_google_state() -> str:
    """Gera um token JWT assinado de curta duração para proteção contra ataques CSRF no fluxo OAuth."""
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.GOOGLE_STATE_TTL_MINUTES)

    payload = {
        "nonce": str(uuid4()),
        "type": "google_state",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return pyjwt.encode(payload, settings.OAUTH_STATE_SECRET, algorithm=settings.ALGORITHM)


def verify_google_state(state: str) -> None:
    """Valida o estado CSRF recebido no callback garantindo assinatura e tempo de vida."""
    settings = get_settings()
    try:
        payload = pyjwt.decode(
            state,
            settings.OAUTH_STATE_SECRET,
            algorithms=[settings.ALGORITHM],
            options={"require": ["nonce", "type", "exp"]},
        )
    except pyjwt.PyJWTError:
        raise InvalidGoogleTokenError(message="Estado OAuth (CSRF) inválido ou expirado.") from None

    if payload.get("type") != "google_state" or not payload.get("nonce"):
        raise InvalidGoogleTokenError(message="Estado OAuth (CSRF) malformado.")


def build_authorization_url(state: str) -> str:
    """Monta a URL de consentimento para a qual o frontend deve redirecionar o usuário."""
    settings = get_settings()
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": state,
    }
    return f"{settings.GOOGLE_AUTH_URL}?{urlencode(params)}"


class GoogleIdentityProvider:
    """Cliente para troca de código OAuth e validação criptográfica de ID Tokens (JWKS)."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client if client is not None else httpx.AsyncClient()
        self._owns_client = client is None
        self._certs: dict[str, Any] | None = None
        self._certs_fetched_at: float | None = None

    async def aclose(self) -> None:
        """Encerra o cliente HTTP subjacente se gerenciado internamente."""
        if self._owns_client:
            await self._client.aclose()

    async def exchange_code_for_id_token(self, code: str) -> str:
        """Envia o código de autorização para o endpoint de tokens do Google."""
        settings = get_settings()
        data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
        try:
            response = await self._client.post(settings.GOOGLE_TOKEN_URL, data=data, timeout=10.0)
        except httpx.HTTPError:
            raise GoogleAuthError() from None

        if response.status_code != 200:
            raise InvalidGoogleTokenError(
                message="Código de autorização Google inválido ou expirado."
            )

        try:
            body = response.json()
        except ValueError:
            raise GoogleAuthError() from None

        id_token = body.get("id_token")
        if not id_token:
            raise InvalidGoogleTokenError(message="O Google não retornou o id_token esperado.")
        return id_token

    async def verify_id_token(self, id_token: str) -> dict[str, Any]:
        """Valida a assinatura RS256 e as claims do ID Token emitido pelo Google."""
        settings = get_settings()

        try:
            header = pyjwt.get_unverified_header(id_token)
        except pyjwt.PyJWTError:
            raise InvalidGoogleTokenError(message="Formato de id_token Google inválido.") from None

        if header.get("alg") != "RS256":
            raise InvalidGoogleTokenError(
                message="Algoritmo de token não suportado (esperado RS256)."
            )

        certs = await self._fetch_certs()
        signing_key = self._signing_key_for_header(certs, header.get("kid"))
        if signing_key is None:
            raise InvalidGoogleTokenError(message="Chave de assinatura (kid) desconhecida.")

        try:
            payload = pyjwt.decode(
                id_token,
                signing_key,
                algorithms=["RS256"],
                audience=settings.GOOGLE_CLIENT_ID,
                issuer=settings.GOOGLE_ISSUER,
                options={
                    "verify_aud": True,
                    "require": ["sub", "email", "exp", "iss", "aud"],
                },
            )
        except pyjwt.PyJWTError:
            raise InvalidGoogleTokenError(
                message="Assinatura ou claims do id_token Google inválidas."
            ) from None

        email = payload.get("email")
        if not email or not self._is_email_verified(payload):
            raise InvalidGoogleTokenError(
                message="A conta Google não possui um endereço de e-mail verificado."
            )

        return payload

    async def _fetch_certs(self) -> dict[str, Any]:
        """Busca o conjunto de chaves públicas JWKS do Google com cache em memória."""
        now = time.monotonic()
        settings = get_settings()
        if (
            self._certs is not None
            and self._certs_fetched_at is not None
            and now - self._certs_fetched_at < settings.GOOGLE_CERTS_CACHE_TTL_SECONDS
        ):
            return self._certs

        try:
            response = await self._client.get(settings.GOOGLE_CERTS_URL, timeout=10.0)
        except httpx.HTTPError:
            raise GoogleAuthError() from None

        if response.status_code != 200:
            raise GoogleAuthError()

        try:
            self._certs = response.json()
        except ValueError:
            raise GoogleAuthError() from None

        self._certs_fetched_at = now
        return self._certs

    @staticmethod
    def _signing_key_for_header(certs: dict[str, Any], kid: str | None) -> Any | None:
        """Constrói a chave pública RSA a partir do JWK com base no kid do token."""
        keys = certs.get("keys", []) if isinstance(certs, dict) else []
        for key in keys:
            if key.get("kid") == kid and key.get("kty") == "RSA":
                try:
                    return pyjwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
                except pyjwt.PyJWTError:
                    logger.warning(
                        "Falha ao construir chave RSA a partir do JWK Google", exc_info=True
                    )
                    return None
        return None

    @staticmethod
    def _is_email_verified(payload: dict[str, Any]) -> bool:
        """Verifica se a claim email_verified é afirmativa."""
        val = payload.get("email_verified")
        if isinstance(val, bool):
            return val
        return isinstance(val, str) and val.lower() == "true"


@lru_cache(maxsize=1)
def get_default_google_provider() -> GoogleIdentityProvider:
    """Instância singleton compartilhada do provedor de identidade Google."""
    return GoogleIdentityProvider()


class GoogleAuthService:
    """Gerencia o fluxo de autenticação e registro federado com Google."""

    def __init__(
        self,
        session: AsyncSession,
        provider: GoogleIdentityProvider | None = None,
    ) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.audit_service = AuditService(session)
        self.token_service = TokenService(session)
        self.provider = provider or get_default_google_provider()

    async def authenticate(
        self,
        *,
        data: GoogleLoginRequest,
        client_ip: str | None = None,
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> tuple[UserModel, TokenPairResponse]:
        """Autentica o usuário por código de autorização ou id_token e emite par de tokens locais."""
        ensure_google_login_enabled()

        try:
            if data.id_token is None:
                assert data.state is not None
                assert data.code is not None
                verify_google_state(data.state)
                id_token = await self.provider.exchange_code_for_id_token(data.code)
            else:
                id_token = data.id_token

            claims = await self.provider.verify_id_token(id_token)
        except (InvalidGoogleTokenError, GoogleAuthError):
            logger.warning("Falha na validação do login Google (IP: %s)", client_ip)
            raise

        email = claims["email"].strip().lower()
        google_id = claims["sub"]
        name = claims.get("name") or email.split("@")[0]

        # 1. Busca por google_id ou por e-mail para vinculação
        user = await self.user_repo.get_by_google_id(google_id)
        if user is None:
            user = await self.user_repo.get_by_email(email)

        # 2. Se não existir, auto-cadastra como usuário verificado
        if user is None:
            user = UserModel(
                email=email,
                full_name=name,
                role=str(UserRole.CLIENT_VIEWER),
                oauth_provider="google",
                google_id=google_id,
                is_active=True,
                is_verified=True,
            )
            user = await self.user_repo.save(user)
            logger.info("Novo usuário registrado via Google OAuth: %s (id=%s)", email, user.id)
        else:
            # Vincula ou atualiza atributos OAuth
            user.is_verified = True
            if user.google_id is None:
                user.google_id = google_id
                user.oauth_provider = "google"
            if not user.full_name and name:
                user.full_name = name

        await self.session.commit()
        await self.session.refresh(user)

        # 3. Trilha de auditoria
        await self.audit_service.record_action(
            action=AuditAction.LOGIN_SUCCESS,
            resource_type="auth",
            resource_id=str(user.id),
            actor_user_id=user.id,
            organization_id=user.organization_id,
            details={"provider": "google", "email": user.email, "google_id": google_id},
            ip_address=client_ip,
        )

        # 4. Emissão de par de tokens
        tokens = await self.token_service.create_token_pair(
            user=user,
            ip_address=client_ip,
            user_agent=user_agent,
            device_name=device_name,
        )

        logger.info(
            "Login social Google concluído com sucesso para %s (id=%s)", user.email, user.id
        )
        return user, tokens
