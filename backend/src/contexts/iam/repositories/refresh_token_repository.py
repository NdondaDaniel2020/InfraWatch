"""Repositório assíncrono para persistência e gestão de Refresh Tokens e Sessões."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.contexts.iam.database.models import RefreshTokenModel


class RefreshTokenRepository:
    """Repositório de persistência de refresh tokens e sessões ativas de usuários."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save(self, record: RefreshTokenModel) -> RefreshTokenModel:
        """Persiste ou atualiza um token de refresh na sessão ativa."""
        self.session.add(record)
        await self.session.flush()
        return record

    async def create(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
        ip_address: str | None = None,
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> RefreshTokenModel:
        """Cria e persiste um novo token de refresh."""
        record = RefreshTokenModel(
            id=session_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_revoked=False,
            ip_address=ip_address,
            user_agent=user_agent,
            device_name=device_name,
        )
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_by_id(self, session_id: UUID) -> RefreshTokenModel | None:

        return await self.session.get(RefreshTokenModel, session_id)

    async def get_by_token_hash(
        self, token_hash: str, *, load_user: bool = False
    ) -> RefreshTokenModel | None:
        """Busca token por hash, opcionalmente carregando o relacionamento user."""
        query = select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
        if load_user:
            query = query.options(selectinload(RefreshTokenModel.user))
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
        return bool((getattr(result, "rowcount", 0) or 0) > 0)

    async def revoke_and_return_ids(
        self, user_id: UUID, current_token_hash: str | None = None
    ) -> list[UUID]:
        """Revoga sessões ativas do usuário e retorna a lista dos IDs revogados."""
        now = datetime.now(UTC)
        query = select(RefreshTokenModel.id).where(
            RefreshTokenModel.user_id == user_id,
            RefreshTokenModel.is_revoked.is_(False),
        )
        if current_token_hash:
            query = query.where(RefreshTokenModel.token_hash != current_token_hash)

        result = await self.session.execute(query)
        session_ids = list(result.scalars().all())

        if not session_ids:
            return []

        stmt = (
            update(RefreshTokenModel)
            .where(RefreshTokenModel.id.in_(session_ids))
            .values(is_revoked=True, revoked_at=now)
        )
        await self.session.execute(stmt)
        await self.session.flush()
        return session_ids

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        """Revoga todas as sessões ativas pertencentes a um usuário."""
        now = datetime.now(UTC)
        stmt = (
            update(RefreshTokenModel)
            .where(
                RefreshTokenModel.user_id == user_id,
                RefreshTokenModel.is_revoked.is_(False),
            )
            .values(is_revoked=True, revoked_at=now)
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def revoke_other_sessions(
        self, user_id: UUID, current_token_hash: str | None = None
    ) -> int:
        """Revoga todas as outras sessões ativas do usuário, exceto a atual."""
        revoked = await self.revoke_and_return_ids(user_id, current_token_hash)
        return len(revoked)

    async def delete_expired(self, before: datetime | None = None) -> int:
        cutoff = before or datetime.now(UTC)
        stmt = delete(RefreshTokenModel).where(RefreshTokenModel.expires_at < cutoff)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(getattr(result, "rowcount", 0) or 0)
