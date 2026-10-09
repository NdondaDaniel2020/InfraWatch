"""Repositório assíncrono para tokens de recuperação de senha."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import PasswordResetTokenModel
from src.contexts.iam.security.tokens import hash_token


class PasswordResetRepository:
    """Repositório de persistência de tokens de redefinição de senha."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save(
        self, record: PasswordResetTokenModel
    ) -> PasswordResetTokenModel:
        """Persiste ou atualiza um token de recuperação de senha na sessão ativa."""
        self.session.add(record)
        await self.session.flush()
        return record

    async def create(
        self,
        *,
        user_id: UUID,
        token: str,
        expires_at: datetime,
    ) -> PasswordResetTokenModel:
        record = PasswordResetTokenModel(
            user_id=user_id,
            token_hash=hash_token(token),
            expires_at=expires_at,
        )
        return await self.save(record)


    async def get_by_token(self, token: str) -> PasswordResetTokenModel | None:
        result = await self.session.execute(
            select(PasswordResetTokenModel).where(
                PasswordResetTokenModel.token_hash == hash_token(token)
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(
        self, record: PasswordResetTokenModel, *, used_at: datetime | None = None
    ) -> None:
        used_ts = used_at or datetime.now(UTC)
        await self.session.execute(
            update(PasswordResetTokenModel)
            .where(PasswordResetTokenModel.id == record.id)
            .values(used=True, used_at=used_ts)
        )
        await self.session.flush()

    async def delete_expired(self, before: datetime | None = None) -> int:
        cutoff = before or datetime.now(UTC)
        result = await self.session.execute(
            delete(PasswordResetTokenModel).where(PasswordResetTokenModel.expires_at < cutoff)
        )
        await self.session.flush()
        return int(result.rowcount or 0)
