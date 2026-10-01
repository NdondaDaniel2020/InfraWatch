"""Rotas da API para streaming de eventos em tempo real via Server-Sent Events (SSE).

Disponibiliza canal unidirecional de alta performance com:
- Headers otimizados para proxies reversos (Nginx X-Accel-Buffering: no)
- Heartbeat periódico de keep-alive a cada 15s (: ping)
- Isolamento estrito de multitenancy por organização
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Header, Query, Request
from sse_starlette.sse import EventSourceResponse

from src.api.dependencies.auth import AuthenticatedUser, SSECurrentUserDep
from src.core.messaging.sse_broadcaster import get_sse_broadcaster

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/events", tags=["Events & Telemetry Stream"])


async def sse_event_stream_generator(
    request: Request,
    user: AuthenticatedUser,
    ping_interval_seconds: float = 15.0,
    last_event_id: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Generator assíncrono que produz eventos formatados em SSE a partir da fila do cliente.

    Emite mensagens JSON quando disponíveis ou comentários de ping (: ping)
    ao atingir o tempo limite de inatividade (heartbeat).
    """
    broadcaster = get_sse_broadcaster()
    connection_id, queue = await broadcaster.connect(user)

    logger.debug(
        "Iniciando streaming SSE para usuário %s (last_event_id=%s)",
        user.id,
        last_event_id,
    )

    try:
        while True:
            # Verifica desconexão graciosa do cliente
            if await request.is_disconnected():
                logger.debug("Cliente desconectado detectado em request.is_disconnected()")
                break

            try:
                # Aguarda o próximo evento na fila com timeout correspondente ao heartbeat
                payload = await asyncio.wait_for(
                    queue.get(),
                    timeout=ping_interval_seconds,
                )
                queue.task_done()

                event_type = str(payload.get("event_type", "message"))
                event_id = str(payload.get("event_id", ""))

                yield {
                    "event": event_type,
                    "data": json.dumps(payload),
                    "id": event_id,
                }
            except TimeoutError:
                # Heartbeat keep-alive para evitar encerramento prematuro em proxies
                yield {"comment": "ping"}
            except asyncio.CancelledError:
                logger.debug("Streaming SSE cancelado pelo framework ou cliente.")
                break
    finally:
        # Garante desconexão e liberação de recursos
        await broadcaster.disconnect(connection_id)


@router.get(
    "/stream",
    response_class=EventSourceResponse,
    summary="Canal Server-Sent Events (SSE) de telemetria e alarmes em tempo real",
    description=(
        "Conexão HTTP streaming contínua que envia eventos de telemetria, mudanças de estado de ativos "
        "e incidentes em tempo real. Suporta autenticação via Bearer token ou query param '?token='."
    ),
)
async def stream_events(
    request: Request,
    current_user: SSECurrentUserDep,
    last_event_id_header: str | None = Header(None, alias="Last-Event-ID"),
    last_event_id_query: str | None = Query(None, alias="last_event_id"),
    ping_interval: float = Query(default=15.0, alias="ping_interval", ge=0.1, le=60.0),
) -> EventSourceResponse:
    """Endpoint principal de streaming SSE com controle de isolamento e keep-alive."""
    effective_last_event_id = last_event_id_header or last_event_id_query

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return EventSourceResponse(
        sse_event_stream_generator(
            request=request,
            user=current_user,
            ping_interval_seconds=ping_interval,
            last_event_id=effective_last_event_id,
        ),
        headers=headers,
        ping=None,  # Controlado explicitamente pelo gerador com yield {"comment": "ping"}
    )
