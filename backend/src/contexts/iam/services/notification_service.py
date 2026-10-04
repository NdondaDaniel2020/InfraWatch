"""Serviço de domínio para gestão e emissão de notificações in-app e streaming SSE."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from contexts.iam.database.models import NotificationModel
from src.contexts.iam.repositories.notification_repository import NotificationRepository
from src.core.messaging.sse_broadcaster import SSEBroadcaster, get_sse_broadcaster

logger = logging.getLogger("infrawatch.identity.notifications")


class NotificationService:
    """Gerencia persistência de notificações no banco e broadcast em tempo real via SSE."""

    def __init__(
        self,
        session: AsyncSession,
        broadcaster: SSEBroadcaster | None = None,
    ) -> None:
        self.session = session
        self.repository = NotificationRepository(session)
        self.broadcaster = broadcaster or get_sse_broadcaster()

    async def notify_user(
        self,
        *,
        user_id: UUID | str,
        event_type: str,
        title: str,
        message: str,
        channel: str = "in_app",
        details: dict[str, Any] | None = None,
    ) -> NotificationModel:
        """Persiste a notificação no banco de dados e transmite em tempo real via SSE para o usuário."""
        notification = await self.repository.create(
            user_id=user_id,
            event_type=event_type,
            title=title,
            message=message,
            channel=channel,
            details=details,
        )

        # Prepara evento serializável para SSE
        sse_event = {
            "event_type": "notification.created",
            "notification": {
                "id": notification.id,
                "user_id": str(notification.user_id),
                "channel": notification.channel,
                "event_type": notification.event_type,
                "title": notification.title,
                "message": notification.message,
                "read": notification.read,
                "details": notification.details,
                "created_at": notification.created_at.isoformat(),
            },
        }

        # Transmite via SSE para as conexões ativas do usuário
        delivered = await self.broadcaster.broadcast_to_user(user_id=user_id, event=sse_event)
        logger.info(
            "Notificação id=%d criada para user_id=%s [event_type=%s, sse_delivered=%d]",
            notification.id,
            user_id,
            event_type,
            delivered,
        )
        return notification

    async def list_notifications(
        self,
        user_id: UUID | str,
        *,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[NotificationModel], int]:
        """Retorna lista paginada de notificações do usuário e o total geral."""
        offset = (page - 1) * page_size
        return await self.repository.list_notifications(
            user_id=user_id,
            unread_only=unread_only,
            limit=page_size,
            offset=offset,
        )

    async def get_unread_count(self, user_id: UUID | str) -> int:
        """Retorna a contagem de notificações não lidas."""
        return await self.repository.count_unread(user_id)

    async def sync_notifications(
        self,
        user_id: UUID | str,
        *,
        since_id: int | None = None,
        since_timestamp: datetime | None = None,
        limit: int = 50,
    ) -> tuple[list[NotificationModel], bool, int | None]:
        """Recupera notificações perdidas para Catch-Up Sync após reconexão SSE."""
        items = await self.repository.get_missed_notifications(
            user_id=user_id,
            since_id=since_id,
            since_timestamp=since_timestamp,
            limit=limit + 1,
        )
        has_more = len(items) > limit
        returned_items = items[:limit]
        last_id = returned_items[-1].id if returned_items else since_id
        return returned_items, has_more, last_id

    async def mark_as_read(
        self,
        notification_id: int,
        user_id: UUID | str,
    ) -> NotificationModel | None:
        """Marca notificação como lida se pertencer ao usuário."""
        notification = await self.repository.mark_as_read(notification_id, user_id)
        if notification:
            await self.session.commit()
            await self.session.refresh(notification)
        return notification

    async def mark_all_as_read(self, user_id: UUID | str) -> int:
        """Marca todas as notificações do usuário como lidas."""
        count = await self.repository.mark_all_as_read(user_id)
        await self.session.commit()
        return count
