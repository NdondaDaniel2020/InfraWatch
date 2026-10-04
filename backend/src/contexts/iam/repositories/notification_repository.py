"""Repositório assíncrono para persistência e consulta de notificações in-app."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from contexts.iam.database.models import NotificationModel


def _ensure_uuid(val: UUID | str) -> UUID:
    """Garante conversão segura de str para UUID."""
    if isinstance(val, UUID):
        return val
    return UUID(str(val))


class NotificationRepository:
    """Gerencia a persistência de notificações e consultas otimizadas para sincronização SSE."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        user_id: UUID | str,
        event_type: str,
        title: str,
        message: str,
        channel: str = "in_app",
        details: dict[str, Any] | None = None,
    ) -> NotificationModel:
        """Cria e persiste uma nova notificação."""
        uid = _ensure_uuid(user_id)
        notification = NotificationModel(
            user_id=uid,
            event_type=event_type,
            title=title,
            message=message,
            channel=channel,
            details=details,
        )
        self.session.add(notification)
        await self.session.flush()
        return notification

    async def get_by_id(
        self,
        notification_id: int,
        user_id: UUID | str | None = None,
    ) -> NotificationModel | None:
        """Busca notificação por id com filtro opcional de usuário para isolamento."""
        stmt = select(NotificationModel).where(NotificationModel.id == notification_id)
        if user_id is not None:
            uid = _ensure_uuid(user_id)
            stmt = stmt.where(NotificationModel.user_id == uid)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_missed_notifications(
        self,
        user_id: UUID | str,
        *,
        since_id: int | None = None,
        since_timestamp: datetime | None = None,
        limit: int = 50,
    ) -> list[NotificationModel]:
        """Recupera notificações para Catch-Up Sync após since_id ou since_timestamp."""
        uid = _ensure_uuid(user_id)
        stmt = select(NotificationModel).where(NotificationModel.user_id == uid)

        if since_id is not None:
            stmt = stmt.where(NotificationModel.id > since_id)
        elif since_timestamp is not None:
            stmt = stmt.where(NotificationModel.created_at > since_timestamp)

        stmt = stmt.order_by(NotificationModel.id.asc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_notifications(
        self,
        user_id: UUID | str,
        *,
        unread_only: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[NotificationModel], int]:
        """Retorna lista paginada e a contagem total de notificações do usuário."""
        uid = _ensure_uuid(user_id)
        base_filter = [NotificationModel.user_id == uid]
        if unread_only:
            base_filter.append(NotificationModel.read.is_(False))

        # Contagem total
        count_stmt = select(func.count(NotificationModel.id)).where(*base_filter)
        total = await self.session.scalar(count_stmt) or 0

        # Registros paginados ordenados decrescentemente
        query = (
            select(NotificationModel)
            .where(*base_filter)
            .order_by(NotificationModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def count_unread(self, user_id: UUID | str) -> int:
        """Retorna a contagem de notificações não lidas para o usuário."""
        uid = _ensure_uuid(user_id)
        stmt = (
            select(func.count(NotificationModel.id))
            .where(NotificationModel.user_id == uid)
            .where(NotificationModel.read.is_(False))
        )
        count = await self.session.scalar(stmt)
        return count or 0

    async def mark_as_read(
        self,
        notification_id: int,
        user_id: UUID | str,
    ) -> NotificationModel | None:
        """Marca notificação como lida se pertencer ao usuário."""
        uid = _ensure_uuid(user_id)
        notification = await self.get_by_id(notification_id, user_id=uid)
        if notification and not notification.read:
            notification.read = True
            await self.session.flush()
        return notification

    async def mark_all_as_read(self, user_id: UUID | str) -> int:
        """Marca todas as notificações não lidas do usuário como lidas."""
        uid = _ensure_uuid(user_id)
        stmt = (
            update(NotificationModel)
            .where(NotificationModel.user_id == uid)
            .where(NotificationModel.read.is_(False))
            .values(read=True)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(result.rowcount or 0)
