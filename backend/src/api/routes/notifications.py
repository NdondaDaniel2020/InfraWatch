"""Rotas REST da API para Gestão e Sincronização Catch-Up de Notificações In-App."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from src.api.dependencies import CurrentUserDep, PaginationParamsDep
from src.contexts.identity.schemas.notification import (
    NotificationListResponse,
    NotificationReadAllResponse,
    NotificationResponse,
    NotificationSyncResponse,
    NotificationUnreadCountResponse,
)
from src.contexts.identity.services.notification_service import NotificationService
from src.core.database.session import DbSessionDep
from src.core.exceptions import NotFoundError

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="Listar notificações in-app do usuário autenticado",
)
async def list_notifications(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    pagination: PaginationParamsDep,
    unread_only: Annotated[
        bool,
        Query(description="Se verdadeiro, filtra apenas notificações não lidas."),
    ] = False,
) -> NotificationListResponse:
    """Retorna lista paginada de notificações destinadas ao usuário logado."""
    service = NotificationService(db)
    items, total = await service.list_notifications(
        user_id=current_user.id,
        unread_only=unread_only,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    unread_count = await service.get_unread_count(current_user.id)

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        unread_count=unread_count,
    )


@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Obter contagem de notificações pendentes de leitura",
)
async def get_unread_count(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NotificationUnreadCountResponse:
    """Retorna o total de notificações não lidas para exibição rápida de badge no frontend."""
    service = NotificationService(db)
    count = await service.get_unread_count(current_user.id)
    return NotificationUnreadCountResponse(unread_count=count)


@router.get(
    "/sync",
    response_model=NotificationSyncResponse,
    summary="Sincronização Catch-Up de notificações após reconexão SSE",
)
async def sync_notifications(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    since_id: Annotated[
        int | None,
        Query(description="Último ID de notificação processado com sucesso pelo cliente."),
    ] = None,
    since_timestamp: Annotated[
        datetime | None,
        Query(description="Timestamp UTC da última sincronização ou evento recebido."),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Quantidade máxima de notificações por lote (1 a 100)."),
    ] = 50,
) -> NotificationSyncResponse:
    """Permite ao cliente recuperar eventos e notificações perdidos durante desconexões temporárias do stream SSE."""
    service = NotificationService(db)
    items, has_more, last_id = await service.sync_notifications(
        user_id=current_user.id,
        since_id=since_id,
        since_timestamp=since_timestamp,
        limit=limit,
    )

    events = [NotificationResponse.model_validate(item) for item in items]
    return NotificationSyncResponse(
        events=events,
        total=len(events),
        has_more=has_more,
        last_id=last_id,
    )


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Marcar notificação como lida",
)
async def mark_notification_as_read(
    notification_id: int,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NotificationResponse:
    """Marca uma notificação específica como lida, assegurando isolamento por usuário."""
    service = NotificationService(db)
    notification = await service.mark_as_read(
        notification_id=notification_id,
        user_id=current_user.id,
    )
    if not notification:
        raise NotFoundError("Notificação não encontrada.")

    await db.commit()
    await db.refresh(notification)
    return NotificationResponse.model_validate(notification)


@router.post(
    "/read-all",
    response_model=NotificationReadAllResponse,
    summary="Marcar todas as notificações como lidas",
)
async def mark_all_notifications_as_read(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> NotificationReadAllResponse:
    """Marca em massa todas as notificações pendentes do usuário como lidas."""
    service = NotificationService(db)
    count = await service.mark_all_as_read(current_user.id)
    await db.commit()
    return NotificationReadAllResponse(marked_as_read=count)
