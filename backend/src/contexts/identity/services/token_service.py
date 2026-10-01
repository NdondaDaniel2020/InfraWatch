"""Serviço de gerenciamento do ciclo de vida de tokens de autenticação (TokenService).

Implementa:
- Emissão de par de tokens (Access Token JWT de 15 min + Refresh Token Opaco de 7 dias)
- Rotação estrita de Refresh Token com Grace Period (10s) para tolerância a concorrência no frontend
- Detecção de reuso malicioso com revogação em cascata de toda a família de sessões do usuário
- Blacklist de Access Tokens no Redis com fallback transparente em memória
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import redis.asyncio as aioredis
from redis.exceptions import RedisError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.contexts.identity.domain.models import RefreshTokenModel, UserModel
from src.contexts.identity.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_opaque_token,
    hash_token,
)
from src.core.config import get_settings
from src.core.exceptions import (
    InvalidTokenError,
    TokenExpiredError,
    TokenReuseDetectedError,
)

logger = logging.getLogger(__name__)

# Fallback em memória para blacklist de tokens quando o Redis estiver inacessível
_in_memory_blacklist: dict[str, float] = {}


def _clean_expired_in_memory_blacklist() -> None:
    """Expurga entradas expiradas do cache em memória."""
    now_ts = datetime.now(UTC).timestamp()
    expired = [jti for jti, exp in _in_memory_blacklist.items() if exp <= now_ts]
    for jti in expired:
        _in_memory_blacklist.pop(jti, None)


@dataclass(frozen=True)
class TokenPairResponse:
    """Estrutura padronizada de resposta contendo o par de tokens emitidos."""

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 900  # Tempo de vida do access token em segundos


class TokenService:
    """Serviço orquestrador do ciclo de vida de tokens de autenticação."""

    def __init__(
        self,
        session: AsyncSession,
        redis_client: aioredis.Redis | None = None,
        grace_period_seconds: int | None = None,
    ) -> None:
        self.session = session
        self._redis = redis_client
        settings = get_settings()
        self._grace_period_seconds = (
            grace_period_seconds
            if grace_period_seconds is not None
            else settings.REFRESH_TOKEN_GRACE_PERIOD_SECONDS
        )

    async def create_token_pair(
        self,
        user: UserModel,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> TokenPairResponse:
        """Emite um novo par de tokens (Access Token JWT e Refresh Token opaco) para o usuário."""
        settings = get_settings()
        now = datetime.now(UTC)

        # 1. Gerar Access Token JWT assinado
        access_token, _ = create_access_token(
            user_id=user.id,
            role=user.role,
            org_id=user.organization_id,
        )

        # 2. Gerar Refresh Token opaco e seguro
        raw_refresh_token = generate_opaque_token(48)
        token_hash = hash_token(raw_refresh_token)

        # 3. Persistir o hash do Refresh Token no banco relacional
        expires_at = now + timedelta(days=settings.JWT_REFRESH_DAYS)
        token_record = RefreshTokenModel(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_revoked=False,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.session.add(token_record)
        await self.session.flush()

        return TokenPairResponse(
            access_token=access_token,
            refresh_token=raw_refresh_token,
            expires_in=settings.JWT_ACCESS_MINUTES * 60,
        )

    async def rotate_refresh_token(
        self,
        raw_refresh_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> TokenPairResponse:
        """Executa a rotação estrita do refresh token com tolerância a concorrência via Grace Period.

        Cenários:
        1. Token inexistente -> InvalidTokenError.
        2. Token expirado -> TokenExpiredError.
        3. Token revogado dentro do Grace Period (<= 10s) -> Reenvia novo par sem invalidar sessão.
        4. Token revogado fora do Grace Period -> ALERTA DE REUSO: Invalida toda a família de sessões do usuário.
        5. Token válido -> Rotaciona com revogação atômica do token anterior.
        """
        settings = get_settings()
        now = datetime.now(UTC)
        token_hash = hash_token(raw_refresh_token)

        # Busca o token no banco com o usuário associado
        query = (
            select(RefreshTokenModel)
            .options(selectinload(RefreshTokenModel.user))
            .where(RefreshTokenModel.token_hash == token_hash)
        )
        result = await self.session.execute(query)
        token_record = result.scalar_one_or_none()

        if token_record is None:
            raise InvalidTokenError("Refresh token inválido ou não encontrado.")

        # Validação de expiração temporal
        if token_record.expires_at <= now:
            raise TokenExpiredError("O refresh token fornecido expirou.")

        # Tratamento de token já revogado
        if token_record.is_revoked:
            revoked_at = token_record.revoked_at or token_record.created_at
            elapsed_seconds = (now - revoked_at).total_seconds()

            # Caso 1: Dentro da janela de tolerância de concorrência (Grace Period)
            if elapsed_seconds <= self._grace_period_seconds:
                logger.info(
                    "Requisição concorrente de renovação dentro do Grace Period (%ss). Retornando sessão ativa.",
                    elapsed_seconds,
                )
                access_token, _ = create_access_token(
                    user_id=token_record.user.id,
                    role=token_record.user.role,
                    org_id=token_record.user.organization_id,
                )
                return TokenPairResponse(
                    access_token=access_token,
                    refresh_token=raw_refresh_token,
                    expires_in=settings.JWT_ACCESS_MINUTES * 60,
                )

            # Caso 2: Fora do Grace Period -> DETECÇÃO DE ROUBO DE SESSÃO / REPLAY ATTACK
            logger.warning(
                "ALERTA DE SEGURANÇA: Tentativa de reuso de refresh token revogado detectada para o usuário %s. "
                "Revogando todas as sessões ativas da família.",
                token_record.user_id,
            )
            # Revogação atômica de todas as sessões ativas do usuário
            await self.session.execute(
                update(RefreshTokenModel)
                .where(
                    RefreshTokenModel.user_id == token_record.user_id,
                    RefreshTokenModel.is_revoked.is_(False),
                )
                .values(is_revoked=True, revoked_at=now)
            )
            await self.session.flush()

            raise TokenReuseDetectedError(
                "Tentativa de reuso de sessão detectada. Toda a família de tokens foi invalidada por segurança."
            )

        # Caso 3: Token ativo e válido -> Rotação Atômica
        new_access_token, _ = create_access_token(
            user_id=token_record.user.id,
            role=token_record.user.role,
            org_id=token_record.user.organization_id,
        )
        new_raw_refresh_token = generate_opaque_token(48)
        new_token_hash = hash_token(new_raw_refresh_token)

        # Atualiza token antigo com revoked_at e link replaced_by
        token_record.is_revoked = True
        token_record.revoked_at = now
        token_record.replaced_by = new_token_hash

        # Persiste o novo token rotacionado
        new_token_record = RefreshTokenModel(
            user_id=token_record.user_id,
            token_hash=new_token_hash,
            expires_at=now + timedelta(days=settings.JWT_REFRESH_DAYS),
            is_revoked=False,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.session.add(new_token_record)
        await self.session.flush()

        return TokenPairResponse(
            access_token=new_access_token,
            refresh_token=new_raw_refresh_token,
            expires_in=settings.JWT_ACCESS_MINUTES * 60,
        )

    async def revoke_refresh_token(
        self,
        raw_refresh_token: str,
        access_token: str | None = None,
    ) -> None:
        """Revoga um refresh token específico e adiciona o access token à blacklist."""
        now = datetime.now(UTC)
        token_hash = hash_token(raw_refresh_token)

        await self.session.execute(
            update(RefreshTokenModel)
            .where(
                RefreshTokenModel.token_hash == token_hash,
                RefreshTokenModel.is_revoked.is_(False),
            )
            .values(is_revoked=True, revoked_at=now)
        )
        await self.session.flush()

        if access_token:
            try:
                payload = decode_access_token(access_token)
                jti = payload.get("jti")
                exp = payload.get("exp")
                if jti and exp:
                    ttl = max(1, exp - int(now.timestamp()))
                    await self.blacklist_access_token(jti, ttl_seconds=ttl)
            except (InvalidTokenError, TokenExpiredError, KeyError) as exc:
                logger.debug("Access token não pôde ser decodificado para blacklist: %s", exc)

    async def revoke_all_user_tokens(self, user_id: UUID) -> None:
        """Revoga todas as sessões ativas pertencentes a um usuário."""
        now = datetime.now(UTC)
        await self.session.execute(
            update(RefreshTokenModel)
            .where(
                RefreshTokenModel.user_id == user_id,
                RefreshTokenModel.is_revoked.is_(False),
            )
            .values(is_revoked=True, revoked_at=now)
        )
        await self.session.flush()

    async def blacklist_access_token(self, jti: str, ttl_seconds: int = 900) -> None:
        """Adiciona o JTI de um Access Token à blacklist com TTL igual ao tempo restante de vida."""
        if not jti or ttl_seconds <= 0:
            return

        if self._redis is not None:
            try:
                await self._redis.set(f"blacklist:token:{jti}", "1", ex=ttl_seconds)
                return
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning(
                    "Falha ao registrar blacklist no Redis, utilizando fallback em memória: %s", exc
                )

        # Fallback resiliente em memória
        _clean_expired_in_memory_blacklist()
        expire_at = datetime.now(UTC).timestamp() + ttl_seconds
        _in_memory_blacklist[jti] = expire_at

    async def is_token_blacklisted(self, jti: str) -> bool:
        """Verifica se o JTI do Access Token consta como revogado/bloqueado."""
        if not jti:
            return False

        if self._redis is not None:
            try:
                val = await self._redis.get(f"blacklist:token:{jti}")
                return val is not None
            except (RedisError, ConnectionError, OSError) as exc:
                logger.warning("Falha ao consultar blacklist no Redis, checando memória: %s", exc)

        _clean_expired_in_memory_blacklist()
        return jti in _in_memory_blacklist
