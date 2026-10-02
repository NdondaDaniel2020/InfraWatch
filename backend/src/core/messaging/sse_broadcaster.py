"""Gerenciador de conexões ativas e broadcast de eventos SSE (Server-Sent Events).

Gerencia filas individuais por conexão de cliente, suporta isolamento multitenant
estrito por organização e transmissão em tempo real de baixa latência (<100ms).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

import uuid6

from src.core.domain.events import DomainEvent

if TYPE_CHECKING:
    from src.contexts.iam.api.dependencies.auth import AuthenticatedUser

logger = logging.getLogger(__name__)


@dataclass
class SSEConnection:
    """Metadados de uma conexão de cliente ativa no endpoint SSE."""

    connection_id: str
    user: AuthenticatedUser
    queue: asyncio.Queue[dict[str, Any]]
    connected_at: datetime


class SSEBroadcaster:
    """Gerenciador centralizado de broadcast em memória para clientes SSE conectados."""

    def __init__(self) -> None:
        self._connections: dict[str, SSEConnection] = {}
        self._lock = asyncio.Lock()

    @property
    def active_connections_count(self) -> int:
        """Número de clientes atualmente conectados ao stream SSE."""
        return len(self._connections)

    async def connect(
        self, user: AuthenticatedUser, max_queue_size: int = 100
    ) -> tuple[str, asyncio.Queue[dict[str, Any]]]:
        """Registra uma nova conexão de cliente SSE e retorna sua fila assíncrona dedicada."""
        connection_id = str(uuid6.uuid7())
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=max_queue_size)
        connection = SSEConnection(
            connection_id=connection_id,
            user=user,
            queue=queue,
            connected_at=datetime.now(UTC),
        )

        async with self._lock:
            self._connections[connection_id] = connection

        logger.info(
            "Cliente SSE conectado: id=%s, user=%s, org=%s, total=%d",
            connection_id,
            user.id,
            user.organization_id,
            len(self._connections),
        )
        return connection_id, queue

    async def disconnect(self, connection_id: str) -> None:
        """Remove a conexão registrada e encerra sua fila."""
        async with self._lock:
            removed = self._connections.pop(connection_id, None)

        if removed:
            logger.info(
                "Cliente SSE desconectado: id=%s, total=%d",
                connection_id,
                len(self._connections),
            )

    def _normalize_event(self, event: DomainEvent | dict[str, Any]) -> dict[str, Any]:
        """Normaliza DomainEvent ou dicionário em formato serializável padrão."""
        if isinstance(event, DomainEvent):
            return event.to_dict()
        if isinstance(event, dict):
            normalized: dict[str, Any] = {}
            for k, v in event.items():
                if isinstance(v, UUID):
                    normalized[k] = str(v)
                elif isinstance(v, datetime):
                    normalized[k] = v.isoformat()
                else:
                    normalized[k] = v
            return normalized
        raise TypeError(f"Evento inválido: {type(event)}. Esperado DomainEvent ou dict.")

    async def broadcast(
        self,
        event: DomainEvent | dict[str, Any],
        organization_id: str | None = None,
    ) -> int:
        """Envia o evento para as conexões ativas qualificadas.

        Regras de Isolamento Multitenancy:
        1. Se organization_id for informado (ou presente no payload):
           - Apenas clientes da mesma organization_id ou administradores globais (SUPER_ADMIN/ADMIN)
             recebem a mensagem.
        2. Se organization_id for None (evento global da infraestrutura):
           - Todos os clientes conectados recebem o evento.

        Retorna o total de clientes que receberam a notificação com sucesso.
        """
        payload = self._normalize_event(event)
        target_org = organization_id or payload.get("organization_id")

        delivered_count = 0
        async with self._lock:
            connections_snapshot = list(self._connections.values())

        for conn in connections_snapshot:
            # Filtro multitenancy: valida se o usuário tem permissão para visualizar o evento
            if target_org is not None and not conn.user.can_access_organization(target_org):
                continue

            try:
                # Envio não-bloqueante; se a fila do cliente estiver cheia, descarta o evento mais antigo
                if conn.queue.full():
                    try:
                        conn.queue.get_nowait()
                        conn.queue.task_done()
                    except asyncio.QueueEmpty:
                        pass
                conn.queue.put_nowait(payload)
                delivered_count += 1
            except Exception:
                logger.exception("Erro ao entregar evento SSE na conexão %s", conn.connection_id)

        logger.debug(
            "Broadcast SSE de '%s': entregue a %d/%d clientes (target_org=%s)",
            payload.get("event_type", "Event"),
            delivered_count,
            len(connections_snapshot),
            target_org,
        )
        return delivered_count

    async def broadcast_to_user(
        self,
        user_id: str | UUID,
        event: DomainEvent | dict[str, Any],
    ) -> int:
        """Envia o evento SSE especificamente para as conexões ativas do usuário indicado.

        Normaliza user_id para string e despacha nas filas assíncronas dedicadas de
        qualquer sessão ativa do usuário (múltiplas abas ou dispositivos).

        Retorna o total de conexões do usuário que receberam o evento.
        """
        payload = self._normalize_event(event)
        target_uid = str(user_id)

        delivered_count = 0
        async with self._lock:
            connections_snapshot = list(self._connections.values())

        for conn in connections_snapshot:
            if str(conn.user.id) != target_uid:
                continue

            try:
                if conn.queue.full():
                    try:
                        conn.queue.get_nowait()
                        conn.queue.task_done()
                    except asyncio.QueueEmpty:
                        pass
                conn.queue.put_nowait(payload)
                delivered_count += 1
            except Exception:
                logger.exception(
                    "Erro ao entregar evento SSE ao usuário %s na conexão %s",
                    target_uid,
                    conn.connection_id,
                )

        logger.debug(
            "Broadcast SSE direcionado ao usuário '%s' (%s): entregue a %d conexões ativas",
            target_uid,
            payload.get("event_type", "Notification"),
            delivered_count,
        )
        return delivered_count


# Instância singleton global do broadcaster SSE
_global_broadcaster: SSEBroadcaster | None = None


def get_sse_broadcaster() -> SSEBroadcaster:
    """Retorna instância singleton do gerenciador de SSE."""
    global _global_broadcaster
    if _global_broadcaster is None:
        _global_broadcaster = SSEBroadcaster()
    return _global_broadcaster
