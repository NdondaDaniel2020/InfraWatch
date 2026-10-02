"""Repositório assíncrono para persistência e gestão de Refresh Tokens e Sessões."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.domain.models import RefreshTokenModel


class RefreshTokenRepository:
    """Repositório de persistência de refresh tokens e sessões ativas de usuários."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, session_id: UUID) -> RefreshTokenModel | None:
        return await self.session.get(RefreshTokenModel, session_id)

    async def get_by_token_hash(self, token_hash: str) -> RefreshTokenModel | None:
        query = select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_active_by_user(self, user_id: UUID) -> list[RefreshTokenModel]:
        """Retorna todas as sessões ativas (não revogadas e válidas) do usuário."""
        now = datetime.now(UTC)
        query = (
            select(RefreshTokenModel)
            .where(
                RefreshTokenModel.user_id == user_id,
                RefreshTokenModel.is_revoked.is_(False),
                RefreshTokenModel.expires_at > now,
            )
            .order_by(RefreshTokenModel.created_at.desc())
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def revoke_by_id_and_user(self, session_id: UUID, user_id: UUID) -> bool:
        """Revoga uma sessão específica pertencente ao usuário."""
        now = datetime.now(UTC)
        stmt = (
            update(RefreshTokenModel)
            .where(
                RefreshTokenModel.id == session_id,
                RefreshTokenModel.user_id == user_id,
                RefreshTokenModel.is_revoked.is_(False),
            )
            .values(is_revoked=True, revoked_at=now)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return bool(result.rowcount and result.rowcount > 0)

    async def revoke_other_sessions(
        self, user_id: UUID, current_token_hash: str | None = None
    ) -> int:
        """Revoga todas as outras sessões ativas do usuário, exceto a atual."""
        now = datetime.now(UTC)
        stmt = update(RefreshTokenModel).where(
            RefreshTokenModel.user_id == user_id,
            RefreshTokenModel.is_revoked.is_(False),
        )
        if current_token_hash:
            stmt = stmt.where(RefreshTokenModel.token_hash != current_token_hash)

        stmt = stmt.values(is_revoked=True, revoked_at=now)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(result.rowcount or 0)

    async def delete_expired(self, before: datetime | None = None) -> int:
        cutoff = before or datetime.now(UTC)
        stmt = delete(RefreshTokenModel).where(RefreshTokenModel.expires_at < cutoff)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(result.rowcount or 0)
