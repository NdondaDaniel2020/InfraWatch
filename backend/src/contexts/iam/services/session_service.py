"""Serviço de gerenciamento de sessões ativas e dispositivos conectados."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from contexts.iam.database.models import RefreshTokenModel
from src.contexts.iam.repositories.refresh_token_repository import (
    RefreshTokenRepository,
)


class SessionService:
    """Gerenciador de sessões ativas de usuários."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = RefreshTokenRepository(session)

    async def list_active_sessions(self, user_id: UUID) -> list[RefreshTokenModel]:
        """Retorna todas as sessões ativas do usuário."""
        return await self.repo.list_active_by_user(user_id)

    async def revoke_session(self, user_id: UUID, session_id: UUID) -> bool:
        """Revoga uma sessão específica."""
        res = await self.repo.revoke_by_id_and_user(session_id=session_id, user_id=user_id)
        await self.session.commit()
        return res

    async def revoke_all_sessions(self, user_id: UUID) -> int:
        """Revoga todas as sessões ativas do usuário."""
        count = await self.repo.revoke_other_sessions(user_id=user_id, current_token_hash=None)
        await self.session.commit()
        return count

    async def revoke_other_sessions(
        self, user_id: UUID, current_token_hash: str | None = None
    ) -> int:
        """Revoga todas as sessões do usuário, preservando a atual se informada."""
        return await self.repo.revoke_other_sessions(user_id, current_token_hash)
