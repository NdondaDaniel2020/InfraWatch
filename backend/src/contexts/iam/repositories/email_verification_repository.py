"""Repositório assíncrono para tokens de verificação de e-mail."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.iam.database.models import EmailVerificationTokenModel
from src.contexts.iam.security.tokens import hash_token


class EmailVerificationRepository:
    """Repositório de persistência de tokens de confirmação de e-mail."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        user_id: UUID,
        token: str,
        expires_at: datetime,
    ) -> EmailVerificationTokenModel:
        record = EmailVerificationTokenModel(
            user_id=user_id,
            token_hash=hash_token(token),
            expires_at=expires_at,
        )
        self.session.add(record)
        await self.session.flush()
        return record

    async def get_by_token(self, token: str) -> EmailVerificationTokenModel | None:
        result = await self.session.execute(
            select(EmailVerificationTokenModel).where(
                EmailVerificationTokenModel.token_hash == hash_token(token)
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(
        self, record: EmailVerificationTokenModel, *, used_at: datetime | None = None
    ) -> None:
        used_ts = used_at or datetime.now(UTC)
        await self.session.execute(
            update(EmailVerificationTokenModel)
            .where(EmailVerificationTokenModel.id == record.id)
            .values(used=True, used_at=used_ts)
        )
        await self.session.flush()

    async def delete_expired(self, before: datetime | None = None) -> int:
        cutoff = before or datetime.now(UTC)
        result = await self.session.execute(
            delete(EmailVerificationTokenModel).where(
                EmailVerificationTokenModel.expires_at < cutoff
            )
        )
        await self.session.flush()
        return int(result.rowcount or 0)
