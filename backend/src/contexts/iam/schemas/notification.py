"""Schemas Pydantic para serialização, paginação e sincronização de notificações in-app."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.core.pagination import PaginatedResponse


class NotificationResponse(BaseModel):
    """Representação serializada de uma notificação in-app."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Identificador sequencial único da notificação.")
    user_id: UUID = Field(description="Identificador do usuário destinatário.")
    channel: str = Field(default="in_app", description="Canal de entrega da notificação.")
    event_type: str = Field(description="Tipo de evento que gerou a notificação.")
    title: str = Field(description="Título amigável da notificação.")
    message: str = Field(description="Corpo descritivo da mensagem.")
    read: bool = Field(default=False, description="Status de leitura da notificação.")
    details: dict[str, Any] | None = Field(
        default=None, description="Metadados complementares do evento em formato JSON."
    )
    created_at: datetime = Field(description="Data e hora UTC de emissão da notificação.")


class NotificationListResponse(PaginatedResponse[NotificationResponse]):
    """Resposta paginada da lista de notificações."""

    unread_count: int = Field(
        default=0, description="Quantidade total de notificações pendentes de leitura."
    )


class NotificationSyncResponse(BaseModel):
    """Resposta para sincronização Catch-Up de notificações após reconexão SSE."""

    events: list[NotificationResponse] = Field(
        description="Lista ordenada cronologicamente de eventos perdidos."
    )
    total: int = Field(description="Quantidade de eventos retornados na resposta.")
    has_more: bool = Field(
        default=False, description="Indica se existem mais eventos posteriores ao lote retornado."
    )
    last_id: int | None = Field(
        default=None, description="Último ID de notificação retornado para referência do cliente."
    )


class NotificationUnreadCountResponse(BaseModel):
    """Contagem de notificações não lidas."""

    unread_count: int = Field(description="Total de notificações não lidas para o usuário.")


class NotificationReadAllResponse(BaseModel):
    """Resultado da marcação em massa de notificações como lidas."""

    marked_as_read: int = Field(description="Total de notificações marcadas como lidas.")


class NotificationCreateRequest(BaseModel):
    """Payload para criação programática ou interna de uma nova notificação."""

    user_id: UUID = Field(description="UUID do destinatário.")
    event_type: str = Field(description="Identificador do tipo de evento.")
    title: str = Field(description="Título da notificação.")
    message: str = Field(description="Mensagem de texto.")
    channel: str = Field(default="in_app", description="Canal de entrega.")
    details: dict[str, Any] | None = Field(
        default=None, description="Metadados adicionais em JSON."
    )
