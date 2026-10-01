"""Serviço de Autenticação com proteção contra Timing Attack e Enumeração de Usuários.

Implementa a ADR-022 / Issue #10:
- Executa verificação criptográfica em tempo constante neutro (constant_time_verify)
  tanto para contas existentes quanto inexistentes, eliminando variações de latência.
- Neutralidade de mensagens de erro: "Credenciais inválidas" uniforme para e-mail incorreto,
  senha incorreta ou conta inativa.
- Integração coordenada com DualKeyRateLimiter (pre_login_check e lockout).
- Emissão atômica de par de tokens de sessão (Access Token JWT + Refresh Token opaco).
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.identity.domain.models import UserModel
from src.contexts.identity.repositories.user_repository import UserRepository
from src.contexts.identity.security.timing import constant_time_verify
from src.contexts.identity.services.auth_rate_limit_service import AuthRateLimitService
from src.contexts.identity.services.token_service import (
    TokenPairResponse,
    TokenService,
)
from src.core.exceptions import AuthenticationError

logger = logging.getLogger(__name__)

# Mensagem estritamente neutra para prevenir enumeração de contas
INVALID_CREDENTIALS_MSG = "Credenciais inválidas."


class AuthService:
    """Orquestrador do fluxo completo de autenticação e proteção contra ataques temporais."""

    def __init__(
        self,
        session: AsyncSession,
        user_repository: UserRepository | None = None,
        token_service: TokenService | None = None,
        rate_limit_service: AuthRateLimitService | None = None,
    ) -> None:
        self.session = session
        self.user_repo = user_repository or UserRepository(session)
        self.token_service = token_service or TokenService(session)
        self.rate_limit_service = rate_limit_service or AuthRateLimitService()

    async def authenticate(
        self,
        email: str,
        password: str,
        *,
        client_ip: str = "127.0.0.1",
        user_agent: str | None = None,
    ) -> tuple[UserModel, TokenPairResponse]:
        """Autentica o usuário de forma neutra e segura contra ataques de temporização.

        Passos:
        1. Pré-checagem de Rate Limiting por IP e Account Lockout (rejeita requisições abusivas sem onerar o banco).
        2. Busca assíncrona do usuário no PostgreSQL.
        3. Verificação criptográfica com Argon2id em tempo constante neutro:
           - Se o usuário não existe ou está inativo, candidate_hash é None -> executa Argon2id contra DUMMY_ARGON2_HASH.
           - Se o usuário existe e está ativo -> executa Argon2id contra o hash real.
        4. Tratamento unificado de credenciais inválidas.
        5. Emissão do par de tokens (JWT + Refresh opaco rotativo).
        """
        norm_email = email.strip().lower()

        # 1. Pré-checagem de bloqueios temporários
        await self.rate_limit_service.pre_login_check(client_ip=client_ip, email=norm_email)

        # 2. Busca do usuário pelo e-mail
        user = await self.user_repo.get_by_email(norm_email)

        # 3. Determinação do hash candidato para neutralidade temporal
        candidate_hash: str | None = None
        if user is not None and user.is_active:
            candidate_hash = user.hashed_password

        # Execução estritamente em tempo constante neutro
        is_password_valid = await constant_time_verify(candidate_hash, password)

        # 4. Falha na autenticação (usuário inexistente, inativo ou senha divergente)
        if not is_password_valid or user is None or not user.is_active:
            await self.rate_limit_service.register_failed_login(
                client_ip=client_ip, email=norm_email
            )
            logger.info(
                "Falha de autenticação para o identificador %s (IP: %s)", norm_email, client_ip
            )
            raise AuthenticationError(INVALID_CREDENTIALS_MSG)

        # 5. Sucesso na autenticação
        await self.rate_limit_service.register_successful_login(
            client_ip=client_ip, email=norm_email
        )

        tokens = await self.token_service.create_token_pair(
            user=user,
            ip_address=client_ip,
            user_agent=user_agent,
        )

        logger.info("Usuário autenticado com sucesso: %s (ID: %s)", user.email, user.id)
        return user, tokens
