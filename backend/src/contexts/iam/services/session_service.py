"""Serviço de gerenciamento de sessões ativas e dispositivos conectados."""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import RefreshTokenModel
from src.contexts.iam.repositories.refresh_token_repository import (
    RefreshTokenRepository,
)
from src.contexts.iam.services.token_service import blacklist_session_ids


class SessionService:
    """Gerenciador de sessões ativas de usuários."""

    def __init__(
        self,
        session: AsyncSession,
        redis_client: aioredis.Redis | None = None,
    ) -> None:
        self.session = session
        self.repo = RefreshTokenRepository(session)
        self._redis = redis_client

    async def list_active_sessions(self, user_id: UUID) -> list[RefreshTokenModel]:
        """Retorna todas as sessões ativas do usuário."""
        return await self.repo.list_active_by_user(user_id)

    async def revoke_session(self, user_id: UUID, session_id: UUID) -> bool:
        """Revoga uma sessão específica no banco e na blacklist do Redis."""
        res = await self.repo.revoke_by_id_and_user(session_id=session_id, user_id=user_id)
        if res:
            await self.session.commit()
            await blacklist_session_ids([session_id], redis_client=self._redis)
        return res

    async def revoke_all_sessions(self, user_id: UUID) -> int:
        """Revoga todas as sessões ativas do usuário no banco e na blacklist do Redis."""
        revoked_ids = await self.repo.revoke_and_return_ids(user_id, current_token_hash=None)
        await self.session.commit()
        if revoked_ids:
            await blacklist_session_ids(revoked_ids, redis_client=self._redis)
        return len(revoked_ids)

    async def revoke_other_sessions(
        self, user_id: UUID, current_token_hash: str | None = None
    ) -> int:
        """Revoga todas as outras sessões do usuário no banco e na blacklist do Redis."""
        revoked_ids = await self.repo.revoke_and_return_ids(user_id, current_token_hash)
        await self.session.commit()
        if revoked_ids:
            await blacklist_session_ids(revoked_ids, redis_client=self._redis)
        return len(revoked_ids)
